import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runScan, ManifestNotFoundError } from "../src/scan.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "fixtures", "typosquat-package.json");
const requirementsFixturePath = join(__dirname, "fixtures", "requirements-typo.txt");

describe("runScan (offline, no network)", () => {
  it("flags the known-typosquat-shaped names in the fixture and skips the real ones", async () => {
    const result = await runScan(fixturePath, { offline: true });
    expect(result.ecosystem).toBe("npm");
    expect(result.offline).toBe(true);
    expect(result.totalDependencies).toBe(8);

    const flaggedNames = result.findings.map((f) => f.dependency.name).sort();
    expect(flaggedNames).toEqual(
      ["chalkk", "eslint-plgin-react", "expresss", "loadash"].sort()
    );

    // react, lodash's real self, vitest, d3-array must never appear as findings
    for (const safe of ["react", "vitest", "d3-array"]) {
      expect(flaggedNames).not.toContain(safe);
    }
  });

  it("flags the known-typosquat-shaped names in a requirements.txt fixture and skips the real ones", async () => {
    const result = await runScan(requirementsFixturePath, { offline: true });
    expect(result.ecosystem).toBe("pypi");
    expect(result.offline).toBe(true);
    expect(result.totalDependencies).toBe(5);

    const flaggedNames = result.findings.map((f) => f.dependency.name).sort();
    expect(flaggedNames).toEqual(["numpyy", "reqeusts"].sort());

    // requests, flask, django's real selves must never appear as findings
    for (const safe of ["requests", "flask", "django"]) {
      expect(flaggedNames).not.toContain(safe);
    }
  });

  it("throws ManifestNotFoundError for a path with nothing scannable", async () => {
    await expect(runScan(join(__dirname, "fixtures", "does-not-exist"))).rejects.toBeInstanceOf(
      ManifestNotFoundError
    );
  });
});
