import type { SimilarityMatch } from "./types.js";

/**
 * Damerau-Levenshtein edit distance: counts insertions, deletions, substitutions,
 * and adjacent-character transpositions as single edits. Transposition support matters
 * here specifically because swapped-adjacent-letter typos ("lodahs" for "lodash") are one
 * of the most common typosquat patterns, and plain Levenshtein would score that as 2.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  // d[i][j] = edit distance between a[0..i) and b[0..j)
  const d: number[][] = Array.from({ length: al + 1 }, () =>
    new Array<number>(bl + 1).fill(0)
  );

  for (let i = 0; i <= al; i++) d[i][0] = i;
  for (let j = 0; j <= bl; j++) d[0][j] = j;

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost // substitution
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        best = Math.min(best, d[i - 2][j - 2] + 1); // transposition
      }
      d[i][j] = best;
    }
  }

  return d[al][bl];
}

/** 0..1, where 1 means identical strings and 0 means completely different. */
export function normalizedSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = damerauLevenshtein(a, b);
  return 1 - distance / maxLen;
}

function describeDifference(candidate: string, popular: string, distance: number): string {
  if (distance === 0) return "identical name";
  if (candidate.toLowerCase() === popular.toLowerCase()) {
    return "differs only by letter casing";
  }
  const stripSep = (s: string) => s.replace(/[-_.]/g, "");
  if (stripSep(candidate) === stripSep(popular)) {
    return "differs only by hyphen/underscore/dot placement";
  }
  if (candidate.length === popular.length) {
    let diffs = 0;
    let transposed = false;
    for (let i = 0; i < candidate.length; i++) {
      if (candidate[i] !== popular[i]) diffs++;
    }
    if (
      candidate.length >= 2 &&
      distance <= 2 &&
      diffs === 2 &&
      candidate.length === popular.length
    ) {
      // Check adjacent swap
      for (let i = 0; i < candidate.length - 1; i++) {
        const swapped = candidate.slice(0, i) + candidate[i + 1] + candidate[i] + candidate.slice(i + 2);
        if (swapped === popular) {
          transposed = true;
          break;
        }
      }
    }
    if (transposed) return "two adjacent characters transposed (classic fat-finger typo)";
    if (distance === 1) return "1 character substituted";
    return `${distance} characters differ (same length)`;
  }
  if (Math.abs(candidate.length - popular.length) === 1) {
    return distance === 1
      ? "1 character inserted or removed"
      : `${distance}-edit insertion/deletion difference`;
  }
  return `${distance}-edit difference (insertions, deletions, and/or substitutions)`;
}

export interface FindMatchesOptions {
  /** Maximum edit distance to consider a candidate "close enough" to flag. Default 2. */
  maxDistance?: number;
  /** Minimum normalized similarity (0..1) required to flag. Default 0.6. */
  minSimilarity?: number;
  /** Skip matching against popular names shorter than this many characters. Default 3. */
  minPopularNameLength?: number;
  /** How many top matches to return. Default 1. */
  limit?: number;
}

/**
 * Compares `candidate` against every name in `popularNames` and returns the closest
 * match(es) that clear both the edit-distance and normalized-similarity thresholds.
 * Returns an empty array if candidate is itself in the popular list (exact match — not
 * suspicious) or if nothing is close enough to be worth flagging.
 */
export function findClosestMatches(
  candidate: string,
  popularNames: readonly string[],
  options: FindMatchesOptions = {}
): SimilarityMatch[] {
  const {
    maxDistance = 2,
    minSimilarity = 0.6,
    minPopularNameLength = 3,
    limit = 1,
  } = options;

  const results: SimilarityMatch[] = [];

  for (const popularName of popularNames) {
    if (popularName === candidate) {
      // Exact match to a known-popular package: never suspicious, short-circuit.
      return [];
    }
    if (popularName.length < minPopularNameLength) continue;
    if (candidate.length < minPopularNameLength) continue;

    // Cheap pre-filter: if lengths differ by more than maxDistance, distance must exceed
    // maxDistance too (edit distance >= |len difference|), skip the expensive DP.
    if (Math.abs(popularName.length - candidate.length) > maxDistance) continue;

    const distance = damerauLevenshtein(candidate, popularName);
    if (distance === 0 || distance > maxDistance) continue;

    const similarity = normalizedSimilarity(candidate, popularName);
    if (similarity < minSimilarity) continue;

    results.push({
      popularName,
      distance,
      similarity,
      reason: describeDifference(candidate, popularName, distance),
    });
  }

  results.sort((x, y) => {
    if (x.distance !== y.distance) return x.distance - y.distance;
    return y.similarity - x.similarity;
  });

  return results.slice(0, limit);
}
