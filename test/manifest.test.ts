import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parsePackageJson,
  parseRequirementsTxt,
  parsePyprojectToml,
  parsePep508Name,
  detectManifest,
} from "../src/manifest.js";

function tempFile(name: string, contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "tsw-test-"));
  const path = join(dir, name);
  writeFileSync(path, contents, "utf8");
  return path;
}

describe("parsePackageJson", () => {
  it("extracts dependencies, devDependencies, peerDependencies, optionalDependencies", () => {
    const path = tempFile(
      "package.json",
      JSON.stringify({
        name: "x",
        dependencies: { react: "^18.0.0" },
        devDependencies: { vitest: "^2.0.0" },
        peerDependencies: { "react-dom": "^18.0.0" },
        optionalDependencies: { fsevents: "^2.0.0" },
      })
    );
    const deps = parsePackageJson(path);
    const names = deps.map((d) => d.name).sort();
    expect(names).toEqual(["fsevents", "react", "react-dom", "vitest"]);
    expect(deps.every((d) => d.ecosystem === "npm")).toBe(true);
  });

  it("returns an empty array when there are no dependency sections", () => {
    const path = tempFile("package.json", JSON.stringify({ name: "x" }));
    expect(parsePackageJson(path)).toEqual([]);
  });
});

describe("parsePep508Name", () => {
  it("extracts a plain name", () => {
    expect(parsePep508Name("requests")).toBe("requests");
  });
  it("extracts name from a version-pinned spec", () => {
    expect(parsePep508Name("requests==2.31.0")).toBe("requests");
  });
  it("extracts name with extras and range", () => {
    expect(parsePep508Name("requests[security]>=2.31,<3")).toBe("requests");
  });
  it("returns null for comments", () => {
    expect(parsePep508Name("# a comment")).toBeNull();
  });
  it("returns null for pip options", () => {
    expect(parsePep508Name("-r base.txt")).toBeNull();
  });
  it("returns null for VCS/URL requirements", () => {
    expect(parsePep508Name("git+https://github.com/x/y.git")).toBeNull();
    expect(parsePep508Name("https://example.com/pkg.whl")).toBeNull();
  });
});

describe("parseRequirementsTxt", () => {
  it("parses a realistic requirements.txt, skipping comments/options/blank lines", () => {
    const path = tempFile(
      "requirements.txt",
      [
        "# core",
        "requests==2.31.0",
        "Flask>=2.0,<3.0  # web framework",
        "",
        "-r other.txt",
        "git+https://github.com/x/y.git",
        "numpy",
      ].join("\n")
    );
    const deps = parseRequirementsTxt(path);
    const names = deps.map((d) => d.name).sort();
    expect(names).toEqual(["flask", "numpy", "requests"]);
    expect(deps.every((d) => d.ecosystem === "pypi")).toBe(true);
  });
});

describe("parsePyprojectToml", () => {
  it("parses PEP 621 [project] dependencies", () => {
    const path = tempFile(
      "pyproject.toml",
      [
        "[project]",
        'name = "x"',
        'dependencies = ["requests>=2.31", "flask"]',
      ].join("\n")
    );
    const deps = parsePyprojectToml(path);
    expect(deps.map((d) => d.name).sort()).toEqual(["flask", "requests"]);
  });

  it("parses Poetry-style [tool.poetry.dependencies], excluding the python key", () => {
    const path = tempFile(
      "pyproject.toml",
      [
        "[tool.poetry.dependencies]",
        'python = "^3.10"',
        'requests = "^2.31"',
        "",
        "[tool.poetry.group.dev.dependencies]",
        'pytest = "^8.0"',
      ].join("\n")
    );
    const deps = parsePyprojectToml(path);
    const names = deps.map((d) => d.name).sort();
    expect(names).toEqual(["pytest", "requests"]);
  });
});

describe("detectManifest", () => {
  it("detects an explicit package.json-like file path by extension", () => {
    const path = tempFile("weird-name.json", "{}");
    expect(detectManifest(path)).toEqual({ kind: "npm", path });
  });

  it("returns null for a path with no recognizable manifest", () => {
    const dir = mkdtempSync(join(tmpdir(), "tsw-test-empty-"));
    expect(detectManifest(dir)).toBeNull();
  });

  it("returns null for a nonexistent path", () => {
    expect(detectManifest(join(tmpdir(), "definitely-does-not-exist-xyz"))).toBeNull();
  });
});
