import { detectManifest, parseManifest } from "./manifest.js";
import { evaluateDependencies, type EvaluateAllOptions } from "./scanner.js";
import type { ScanResult } from "./types.js";

export class ManifestNotFoundError extends Error {
  constructor(inputPath: string) {
    super(
      `Could not find a supported manifest at "${inputPath}" ` +
        `(looked for package.json, requirements.txt, pyproject.toml).`
    );
    this.name = "ManifestNotFoundError";
  }
}

export interface RunScanOptions extends EvaluateAllOptions {}

export async function runScan(
  inputPath: string,
  options: RunScanOptions = {}
): Promise<ScanResult> {
  const detected = detectManifest(inputPath);
  if (!detected) {
    throw new ManifestNotFoundError(inputPath);
  }

  const deps = parseManifest(detected);
  const ecosystem = detected.kind === "npm" ? "npm" : "pypi";
  const findings = await evaluateDependencies(deps, options);

  return {
    ecosystem,
    manifestPath: detected.path,
    totalDependencies: deps.length,
    offline: options.offline ?? false,
    findings,
  };
}
