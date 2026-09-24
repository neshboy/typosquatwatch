export type Ecosystem = "npm" | "pypi";

export interface ManifestDependency {
  name: string;
  versionRange: string;
  ecosystem: Ecosystem;
  /** Which section of the manifest this came from, e.g. "dependencies", "devDependencies". */
  section: string;
}

export interface SimilarityMatch {
  /** The known-popular package name this candidate resembles. */
  popularName: string;
  /** Damerau-Levenshtein edit distance between candidate and popularName. */
  distance: number;
  /** 0..1 normalized similarity, 1 = identical. */
  similarity: number;
  /** Human-readable reason, e.g. "1 character substitution" or "hyphen inserted". */
  reason: string;
}

export interface RegistryEvidence {
  ecosystem: Ecosystem;
  name: string;
  found: boolean;
  /** ISO timestamp of first publish, if known. */
  firstPublished?: string;
  ageInDays?: number;
  versionCount?: number;
  weeklyDownloads?: number;
  latestVersion?: string;
  error?: string;
}

export type Verdict = "HIGH_RISK" | "MEDIUM_RISK" | "LOW_RISK" | "OK" | "UNKNOWN";

export interface ScanFinding {
  dependency: ManifestDependency;
  bestMatch: SimilarityMatch | null;
  evidence: RegistryEvidence | null;
  score: number;
  verdict: Verdict;
  reasons: string[];
}

export interface ScanResult {
  ecosystem: Ecosystem;
  manifestPath: string;
  totalDependencies: number;
  offline: boolean;
  findings: ScanFinding[];
}
