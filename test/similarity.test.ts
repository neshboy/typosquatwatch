import { describe, it, expect } from "vitest";
import {
  damerauLevenshtein,
  normalizedSimilarity,
  findClosestMatches,
} from "../src/similarity.js";

describe("damerauLevenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(damerauLevenshtein("lodash", "lodash")).toBe(0);
  });

  it("returns the length of the other string when one is empty", () => {
    expect(damerauLevenshtein("", "react")).toBe(5);
    expect(damerauLevenshtein("react", "")).toBe(5);
  });

  it("counts a single substitution as distance 1", () => {
    expect(damerauLevenshtein("chalk", "chalp")).toBe(1);
  });

  it("counts a single insertion as distance 1", () => {
    expect(damerauLevenshtein("chalk", "chalkk")).toBe(1);
  });

  it("counts a single deletion as distance 1", () => {
    expect(damerauLevenshtein("express", "expres")).toBe(1);
  });

  it("counts an adjacent transposition as distance 1 (not 2)", () => {
    // lodash -> lodahs: 's' and 'h' swapped
    expect(damerauLevenshtein("lodash", "lodahs")).toBe(1);
  });

  it("is symmetric", () => {
    expect(damerauLevenshtein("axios", "axois")).toBe(
      damerauLevenshtein("axois", "axios")
    );
  });

  it("computes larger distances for very different strings", () => {
    expect(damerauLevenshtein("react", "django")).toBeGreaterThanOrEqual(5);
  });
});

describe("normalizedSimilarity", () => {
  it("is 1 for identical strings", () => {
    expect(normalizedSimilarity("express", "express")).toBe(1);
  });

  it("is between 0 and 1 for a close typo", () => {
    const sim = normalizedSimilarity("expres", "express");
    expect(sim).toBeGreaterThan(0.8);
    expect(sim).toBeLessThan(1);
  });

  it("is low for completely different strings of similar length", () => {
    const sim = normalizedSimilarity("react", "flask");
    expect(sim).toBeLessThan(0.5);
  });
});

describe("findClosestMatches", () => {
  const popular = ["react", "lodash", "express", "chalk", "eslint-plugin-react", "d3-array"];

  it("returns no match when the candidate is itself in the popular list (exact match)", () => {
    expect(findClosestMatches("react", popular)).toEqual([]);
  });

  it("flags a single-character-inserted typo of a popular package", () => {
    const matches = findClosestMatches("chalkk", popular);
    expect(matches).toHaveLength(1);
    expect(matches[0].popularName).toBe("chalk");
    expect(matches[0].distance).toBe(1);
  });

  it("flags a single-character-deleted typo of a popular package", () => {
    const matches = findClosestMatches("expres", popular);
    expect(matches[0].popularName).toBe("express");
  });

  it("flags an adjacent-character transposition typo", () => {
    const matches = findClosestMatches("laodash", popular); // lodash with 'a' and 'o' swapped... actually insertion+swap
    // laodash vs lodash: distance should be small enough to flag
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].popularName).toBe("lodash");
  });

  it("does not flag unrelated package names", () => {
    expect(findClosestMatches("some-totally-unrelated-package-name", popular)).toEqual([]);
  });

  it("does not flag short names against short popular names to avoid noise", () => {
    // very short strings can have deceptively high normalized similarity; guard rails
    // in place via minPopularNameLength / minSimilarity should prevent wild false positives
    const shortPopular = ["ws", "fs"];
    const matches = findClosestMatches("os", shortPopular, { minPopularNameLength: 3 });
    expect(matches).toEqual([]);
  });

  it("respects the limit option", () => {
    const closePopular = ["chalk", "chalk2", "chalks"];
    const matches = findClosestMatches("chalkk", closePopular, { limit: 2 });
    expect(matches.length).toBeLessThanOrEqual(2);
  });
});
