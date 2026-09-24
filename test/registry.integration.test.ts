// NETWORK-DEPENDENT INTEGRATION TESTS
//
// These tests make real HTTP requests to registry.npmjs.org and api.npmjs.org. They are
// kept in a separate *.integration.test.ts file specifically so CI (or anyone offline) can
// skip them, e.g.: `vitest run --exclude "**/*.integration.test.ts"` (see the `test:unit`
// npm script). They confirm the core false-positive-avoidance claim in the README: real,
// hugely popular packages must NOT be flagged as typosquats of themselves, and their
// evidence should look exactly like what a well-established package looks like.
import { describe, it, expect } from "vitest";
import { getNpmEvidence, getPyPIEvidence } from "../src/registry.js";
import { evaluateDependency } from "../src/scanner.js";
import type { ManifestDependency } from "../src/types.js";

const KNOWN_REAL_NPM_PACKAGES = ["react", "lodash", "express"];

describe("getNpmEvidence (real network calls)", () => {
  for (const name of KNOWN_REAL_NPM_PACKAGES) {
    it(`reports ${name} as long-established with real download volume`, async () => {
      const evidence = await getNpmEvidence(name);
      expect(evidence.found).toBe(true);
      expect(evidence.error).toBeUndefined();
      expect(evidence.versionCount ?? 0).toBeGreaterThan(10);
      expect(evidence.ageInDays ?? 0).toBeGreaterThan(365 * 3); // all 3 predate 2023 by years
      expect(evidence.weeklyDownloads ?? 0).toBeGreaterThan(100_000);
    });
  }

  it("reports a definitely-nonexistent package name as not found", async () => {
    const evidence = await getNpmEvidence(
      "this-package-name-should-never-exist-typosquatwatch-canary-9f3e2a"
    );
    expect(evidence.found).toBe(false);
    expect(evidence.error).toBeUndefined();
  });
});

describe("evaluateDependency end-to-end (real network calls, npm)", () => {
  for (const name of KNOWN_REAL_NPM_PACKAGES) {
    it(`does not flag ${name} itself as suspicious`, async () => {
      const dep: ManifestDependency = {
        name,
        versionRange: "*",
        ecosystem: "npm",
        section: "dependencies",
      };
      const finding = await evaluateDependency(dep);
      expect(finding).toBeNull();
    });
  }

  it("flags a close typo of a real popular package with online evidence attached", async () => {
    // "expresss" (extra s) — verified manually to exist on the registry as a long-dormant,
    // near-zero-download package, which is exactly the profile this tool should surface.
    const dep: ManifestDependency = {
      name: "expresss",
      versionRange: "*",
      ecosystem: "npm",
      section: "dependencies",
    };
    const finding = await evaluateDependency(dep);
    expect(finding).not.toBeNull();
    expect(finding!.bestMatch?.popularName).toBe("express");
    expect(finding!.evidence).not.toBeNull();
    expect(finding!.evidence!.found).toBe(true);
  });
});

describe("getPyPIEvidence (real network calls)", () => {
  it("reports 'requests' as long-established with real download volume", async () => {
    const evidence = await getPyPIEvidence("requests");
    expect(evidence.found).toBe(true);
    expect(evidence.versionCount ?? 0).toBeGreaterThan(10);
  });
});
