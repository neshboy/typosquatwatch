import type {
  ManifestDependency,
  RegistryEvidence,
  ScanFinding,
  SimilarityMatch,
  Verdict,
} from "./types.js";
import { findClosestMatches } from "./similarity.js";
import { getPopularPackages, isKnownPopular, normalizePyPIName } from "./popularPackages.js";
import { getNpmEvidence, getPyPIEvidence } from "./registry.js";

export interface ScoreWeights {
  similarity: number;
  newness: number;
  lowDownloads: number;
  fewVersions: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  similarity: 0.4,
  newness: 0.2,
  lowDownloads: 0.3,
  fewVersions: 0.1,
};

/** 1.0 at age<=7 days, decays linearly to 0 by age>=365 days. */
function newnessFactor(ageInDays: number | undefined): number {
  if (ageInDays === undefined || Number.isNaN(ageInDays)) return 0.5; // unknown: mild suspicion
  if (ageInDays <= 7) return 1;
  if (ageInDays >= 365) return 0;
  return 1 - (ageInDays - 7) / (365 - 7);
}

/** 1.0 at 0 downloads/week, decays linearly to 0 by 10,000/week. */
function lowDownloadFactor(weeklyDownloads: number | undefined): number {
  if (weeklyDownloads === undefined) return 0.5; // unknown: mild suspicion
  if (weeklyDownloads <= 0) return 1;
  if (weeklyDownloads >= 10_000) return 0;
  return 1 - weeklyDownloads / 10_000;
}

/** 1.0 at <=1 published version, decays linearly to 0 by 10 versions. */
function fewVersionsFactor(versionCount: number | undefined): number {
  if (versionCount === undefined) return 0.5; // unknown: mild suspicion
  if (versionCount <= 1) return 1;
  if (versionCount >= 10) return 0;
  return 1 - (versionCount - 1) / (10 - 1);
}

export function scoreCandidate(
  bestMatch: SimilarityMatch,
  evidence: RegistryEvidence | null,
  weights: ScoreWeights = DEFAULT_WEIGHTS
): { score: number; reasons: string[] } {
  const reasons: string[] = [
    `name is ${(bestMatch.similarity * 100).toFixed(0)}% similar to popular package "${bestMatch.popularName}" (edit distance ${bestMatch.distance}: ${bestMatch.reason})`,
  ];

  if (!evidence) {
    // Offline mode: similarity is the only signal we have.
    return { score: bestMatch.similarity, reasons };
  }

  if (!evidence.found) {
    if (evidence.error) {
      reasons.push(`could not reach registry to verify (${evidence.error})`);
      return { score: bestMatch.similarity, reasons };
    }
    reasons.push(
      "package does not exist on the registry — not currently installable, but is not a typo of nothing either; watch for future registration of this exact name"
    );
    return { score: bestMatch.similarity * 0.7, reasons };
  }

  const newness = newnessFactor(evidence.ageInDays);
  const lowDownloads = lowDownloadFactor(evidence.weeklyDownloads);
  const fewVersions = fewVersionsFactor(evidence.versionCount);

  if (evidence.ageInDays !== undefined) {
    reasons.push(
      evidence.ageInDays <= 90
        ? `published only ${evidence.ageInDays} day(s) ago (recent registration is a red flag)`
        : `first published ${evidence.ageInDays} day(s) ago`
    );
  }
  if (evidence.weeklyDownloads !== undefined) {
    reasons.push(
      evidence.weeklyDownloads < 100
        ? `only ${evidence.weeklyDownloads} download(s) last week (near-zero adoption)`
        : `${evidence.weeklyDownloads} downloads last week`
    );
  }
  if (evidence.versionCount !== undefined) {
    reasons.push(`${evidence.versionCount} version(s) published`);
  }

  const score =
    weights.similarity * bestMatch.similarity +
    weights.newness * newness +
    weights.lowDownloads * lowDownloads +
    weights.fewVersions * fewVersions;

  return { score: Math.min(1, Math.max(0, score)), reasons };
}

export function verdictForScore(score: number): Verdict {
  if (score >= 0.55) return "HIGH_RISK";
  if (score >= 0.35) return "MEDIUM_RISK";
  return "LOW_RISK";
}

export interface EvaluateOptions {
  offline?: boolean;
  weights?: ScoreWeights;
  /** Injected for testing; defaults to the real network-calling functions. */
  fetchEvidence?: (dep: ManifestDependency) => Promise<RegistryEvidence>;
}

async function defaultFetchEvidence(dep: ManifestDependency): Promise<RegistryEvidence> {
  return dep.ecosystem === "npm" ? getNpmEvidence(dep.name) : getPyPIEvidence(dep.name);
}

/**
 * Evaluates a single dependency: skips it (no finding) if it's an exact match to a known
 * popular package, otherwise runs the similarity check and, unless offline, fetches real
 * registry evidence to refine the score.
 */
export async function evaluateDependency(
  dep: ManifestDependency,
  options: EvaluateOptions = {}
): Promise<ScanFinding | null> {
  if (isKnownPopular(dep.name, dep.ecosystem)) {
    return null;
  }

  const popularNames = getPopularPackages(dep.ecosystem);
  // PyPI treats -, _, . as interchangeable (PEP 503), so compare normalized forms on both
  // sides here too — otherwise a spelling-variant-only name (e.g. "typing_extensions" vs.
  // the seed list's "typing-extensions") gets scored as a near-typosquat of itself.
  const candidateName = dep.ecosystem === "pypi" ? normalizePyPIName(dep.name) : dep.name;
  const comparisonPopularNames =
    dep.ecosystem === "pypi" ? popularNames.map(normalizePyPIName) : popularNames;
  const matches = findClosestMatches(candidateName, comparisonPopularNames, { limit: 1 });
  if (matches.length === 0) {
    return null;
  }
  const bestMatch = matches[0];

  const offline = options.offline ?? false;
  const evidence = offline
    ? null
    : await (options.fetchEvidence ?? defaultFetchEvidence)(dep);

  const { score, reasons } = scoreCandidate(bestMatch, evidence, options.weights);
  const verdict = verdictForScore(score);

  return { dependency: dep, bestMatch, evidence, score, verdict, reasons };
}

export interface EvaluateAllOptions extends EvaluateOptions {
  concurrency?: number;
}

/** Evaluates every dependency, running network-bound checks with bounded concurrency. */
export async function evaluateDependencies(
  deps: ManifestDependency[],
  options: EvaluateAllOptions = {}
): Promise<ScanFinding[]> {
  const concurrency = options.concurrency ?? 6;
  const results: (ScanFinding | null)[] = new Array(deps.length).fill(null);

  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= deps.length) return;
      results[index] = await evaluateDependency(deps[index], options);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, deps.length) }, () => worker());
  await Promise.all(workers);

  return results.filter((r): r is ScanFinding => r !== null);
}
