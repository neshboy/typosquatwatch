import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Ecosystem } from "./types.js";

// This file lives at dist/popularPackages.js after build; data/ sits one level up
// from dist/, at the package root (see package.json "files": ["dist", "data", ...]).
const moduleDir = dirname(fileURLToPath(import.meta.url));
const dataDir = join(moduleDir, "..", "data");

let npmCache: string[] | null = null;
let pypiCache: string[] | null = null;
let npmSetCache: Set<string> | null = null;
let pypiSetCache: Set<string> | null = null;

function loadList(fileName: string): string[] {
  const raw = readFileSync(join(dataDir, fileName), "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected ${fileName} to contain a JSON array of package names`);
  }
  return parsed as string[];
}

/** The curated + fetched seed list of well-known npm package names. See README for provenance. */
export function getPopularNpmPackages(): string[] {
  if (!npmCache) npmCache = loadList("popular-npm-packages.json");
  return npmCache;
}

/** The curated seed list of well-known PyPI package names. */
export function getPopularPyPIPackages(): string[] {
  if (!pypiCache) pypiCache = loadList("popular-pypi-packages.json");
  return pypiCache;
}

export function getPopularPackages(ecosystem: Ecosystem): string[] {
  return ecosystem === "npm" ? getPopularNpmPackages() : getPopularPyPIPackages();
}

/**
 * PEP 503 name normalization: lowercase, then collapse any run of `-`, `_`, `.` into a
 * single `-`. PyPI treats e.g. "typing_extensions", "typing.extensions", and
 * "typing-extensions" as the exact same package, so comparisons against the PyPI seed
 * list must normalize both sides this way or spelling-variant-only names get misjudged
 * as typosquats of themselves.
 */
export function normalizePyPIName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

export function isKnownPopular(name: string, ecosystem: Ecosystem): boolean {
  if (ecosystem === "npm") {
    if (!npmSetCache) npmSetCache = new Set(getPopularNpmPackages());
    return npmSetCache.has(name);
  }
  if (!pypiSetCache) pypiSetCache = new Set(getPopularPyPIPackages().map(normalizePyPIName));
  return pypiSetCache.has(normalizePyPIName(name));
}
