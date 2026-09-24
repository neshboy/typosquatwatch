import { readFileSync, existsSync, statSync } from "node:fs";
import { basename } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { ManifestDependency } from "./types.js";

const NPM_DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

export function parsePackageJson(filePath: string): ManifestDependency[] {
  const raw = readFileSync(filePath, "utf8");
  const pkg = JSON.parse(raw) as Record<string, unknown>;
  const deps: ManifestDependency[] = [];

  for (const section of NPM_DEPENDENCY_SECTIONS) {
    const table = pkg[section];
    if (!table || typeof table !== "object") continue;
    for (const [name, versionRange] of Object.entries(table as Record<string, string>)) {
      deps.push({ name, versionRange: String(versionRange), ecosystem: "npm", section });
    }
  }

  return deps;
}

/**
 * Extracts the bare package name from a PEP 508-ish requirement string, e.g.
 * "requests[security]>=2.31,<3" -> "requests", "  Flask == 2.0.1  " -> "Flask".
 * Returns null for lines that aren't a plain named requirement (URLs, VCS refs, options).
 */
export function parsePep508Name(spec: string): string | null {
  const trimmed = spec.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  if (trimmed.startsWith("-")) return null; // pip options like -r, -e, --hash
  if (/^[a-zA-Z]+:\/\//.test(trimmed)) return null; // direct URL / VCS reference
  if (trimmed.includes("://")) return null;

  const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(trimmed);
  if (!match) return null;
  return match[1];
}

export function parseRequirementsTxt(filePath: string): ManifestDependency[] {
  const raw = readFileSync(filePath, "utf8");
  const deps: ManifestDependency[] = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    const withoutComment = rawLine.split("#")[0];
    const name = parsePep508Name(withoutComment);
    if (!name) continue;
    const versionRange = withoutComment.trim().slice(name.length).trim();
    deps.push({
      name: name.toLowerCase(),
      versionRange: versionRange || "*",
      ecosystem: "pypi",
      section: basename(filePath),
    });
  }

  return deps;
}

function collectPoetryDeps(
  table: unknown,
  section: string,
  out: ManifestDependency[]
): void {
  if (!table || typeof table !== "object") return;
  for (const [name, spec] of Object.entries(table as Record<string, unknown>)) {
    if (name === "python") continue; // python version constraint, not a package
    const versionRange =
      typeof spec === "string"
        ? spec
        : spec && typeof spec === "object" && "version" in (spec as Record<string, unknown>)
          ? String((spec as Record<string, unknown>).version)
          : "*";
    out.push({ name: name.toLowerCase(), versionRange, ecosystem: "pypi", section });
  }
}

export function parsePyprojectToml(filePath: string): ManifestDependency[] {
  const raw = readFileSync(filePath, "utf8");
  const doc = parseToml(raw) as Record<string, any>;
  const deps: ManifestDependency[] = [];

  // PEP 621: [project] dependencies = ["requests>=2.0", ...]
  const project = doc.project;
  if (project?.dependencies && Array.isArray(project.dependencies)) {
    for (const spec of project.dependencies) {
      const name = parsePep508Name(String(spec));
      if (!name) continue;
      deps.push({
        name: name.toLowerCase(),
        versionRange: String(spec).slice(name.length).trim() || "*",
        ecosystem: "pypi",
        section: "project.dependencies",
      });
    }
  }
  if (project?.["optional-dependencies"] && typeof project["optional-dependencies"] === "object") {
    for (const [group, specs] of Object.entries(
      project["optional-dependencies"] as Record<string, unknown>
    )) {
      if (!Array.isArray(specs)) continue;
      for (const spec of specs) {
        const name = parsePep508Name(String(spec));
        if (!name) continue;
        deps.push({
          name: name.toLowerCase(),
          versionRange: String(spec).slice(name.length).trim() || "*",
          ecosystem: "pypi",
          section: `project.optional-dependencies.${group}`,
        });
      }
    }
  }

  // Poetry: [tool.poetry.dependencies], [tool.poetry.dev-dependencies],
  // [tool.poetry.group.<name>.dependencies]
  const poetry = doc.tool?.poetry;
  if (poetry) {
    collectPoetryDeps(poetry.dependencies, "tool.poetry.dependencies", deps);
    collectPoetryDeps(poetry["dev-dependencies"], "tool.poetry.dev-dependencies", deps);
    if (poetry.group && typeof poetry.group === "object") {
      for (const [groupName, groupTable] of Object.entries(
        poetry.group as Record<string, any>
      )) {
        collectPoetryDeps(
          groupTable?.dependencies,
          `tool.poetry.group.${groupName}.dependencies`,
          deps
        );
      }
    }
  }

  return deps;
}

export type DetectedManifest =
  | { kind: "npm"; path: string }
  | { kind: "pyproject"; path: string }
  | { kind: "requirements"; path: string };

/**
 * Given a path that may be a directory or a specific manifest file, figures out which
 * manifest to scan. Directories are checked in order: package.json, then
 * requirements.txt, then pyproject.toml.
 */
export function detectManifest(inputPath: string): DetectedManifest | null {
  const stat = existsSync(inputPath) ? statSync(inputPath) : null;

  const asFile = (path: string): DetectedManifest | null => {
    const name = basename(path).toLowerCase();
    // An explicit file path is trusted by its extension/suffix, not just the exact
    // canonical filename — useful for e.g. test fixtures or renamed manifests.
    if (name.endsWith(".json")) return { kind: "npm", path };
    if (name.endsWith(".toml")) return { kind: "pyproject", path };
    if (name.endsWith(".txt")) return { kind: "requirements", path };
    return null;
  };

  if (stat && stat.isFile()) {
    return asFile(inputPath);
  }

  const dir = inputPath;
  const candidates: DetectedManifest[] = [
    { kind: "npm", path: `${dir}/package.json` },
    { kind: "requirements", path: `${dir}/requirements.txt` },
    { kind: "pyproject", path: `${dir}/pyproject.toml` },
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate.path)) return candidate;
  }
  return null;
}

export function parseManifest(detected: DetectedManifest): ManifestDependency[] {
  switch (detected.kind) {
    case "npm":
      return parsePackageJson(detected.path);
    case "requirements":
      return parseRequirementsTxt(detected.path);
    case "pyproject":
      return parsePyprojectToml(detected.path);
  }
}
