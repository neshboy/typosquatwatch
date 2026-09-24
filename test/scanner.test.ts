import { describe, it, expect } from "vitest";
import {
  evaluateDependency,
  evaluateDependencies,
  scoreCandidate,
  verdictForScore,
} from "../src/scanner.js";
import type { ManifestDependency, RegistryEvidence, SimilarityMatch } from "../src/types.js";

const closeMatch: SimilarityMatch = {
  popularName: "lodash",
  distance: 1,
  similarity: 0.86,
  reason: "1 character inserted or removed",
};

describe("scoreCandidate", () => {
  it("uses raw similarity as the score in offline mode (no evidence)", () => {
    const { score } = scoreCandidate(closeMatch, null);
    expect(score).toBe(closeMatch.similarity);
  });

  it("scores a brand-new, zero-download package as high risk", () => {
    const evidence: RegistryEvidence = {
      ecosystem: "npm",
      name: "loadash",
      found: true,
      firstPublished: new Date().toISOString(),
      ageInDays: 1,
      versionCount: 1,
      weeklyDownloads: 0,
    };
    const { score } = scoreCandidate(closeMatch, evidence);
    expect(verdictForScore(score)).toBe("HIGH_RISK");
  });

  it("scores a long-established, well-downloaded lookalike as low/medium risk, not high", () => {
    const evidence: RegistryEvidence = {
      ecosystem: "npm",
      name: "loadash",
      found: true,
      firstPublished: new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
      ageInDays: 5 * 365,
      versionCount: 20,
      weeklyDownloads: 500_000,
    };
    const { score } = scoreCandidate(closeMatch, evidence);
    expect(verdictForScore(score)).not.toBe("HIGH_RISK");
  });

  it("discounts (but does not zero out) score for names that don't exist on the registry yet", () => {
    const evidence: RegistryEvidence = { ecosystem: "npm", name: "loadash", found: false };
    const { score } = scoreCandidate(closeMatch, evidence);
    expect(score).toBeCloseTo(closeMatch.similarity * 0.7, 5);
  });
});

describe("verdictForScore", () => {
  it("buckets scores into HIGH/MEDIUM/LOW", () => {
    expect(verdictForScore(0.9)).toBe("HIGH_RISK");
    expect(verdictForScore(0.4)).toBe("MEDIUM_RISK");
    expect(verdictForScore(0.1)).toBe("LOW_RISK");
  });
});

describe("evaluateDependency (offline, no network)", () => {
  it("returns null for an exact match to a known-popular package", async () => {
    const dep: ManifestDependency = {
      name: "react",
      versionRange: "^18.0.0",
      ecosystem: "npm",
      section: "dependencies",
    };
    expect(await evaluateDependency(dep, { offline: true })).toBeNull();
  });

  it("returns null for a name unrelated to anything popular", async () => {
    const dep: ManifestDependency = {
      name: "my-completely-original-internal-tool",
      versionRange: "1.0.0",
      ecosystem: "npm",
      section: "dependencies",
    };
    expect(await evaluateDependency(dep, { offline: true })).toBeNull();
  });

  it("flags a close typo of a popular package using similarity alone", async () => {
    const dep: ManifestDependency = {
      name: "chalkk",
      versionRange: "^5.0.0",
      ecosystem: "npm",
      section: "dependencies",
    };
    const finding = await evaluateDependency(dep, { offline: true });
    expect(finding).not.toBeNull();
    expect(finding!.bestMatch?.popularName).toBe("chalk");
    expect(finding!.evidence).toBeNull();
  });
});

describe("evaluateDependencies with injected fetchEvidence (no real network)", () => {
  it("calls fetchEvidence only for flagged candidates, not for exact matches", async () => {
    const deps: ManifestDependency[] = [
      { name: "react", versionRange: "^18.0.0", ecosystem: "npm", section: "dependencies" },
      { name: "chalkk", versionRange: "^5.0.0", ecosystem: "npm", section: "dependencies" },
    ];
    const called: string[] = [];
    const findings = await evaluateDependencies(deps, {
      fetchEvidence: async (dep) => {
        called.push(dep.name);
        return { ecosystem: "npm", name: dep.name, found: false };
      },
    });
    expect(called).toEqual(["chalkk"]);
    expect(findings).toHaveLength(1);
    expect(findings[0].dependency.name).toBe("chalkk");
  });
});
