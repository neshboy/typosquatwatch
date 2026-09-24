#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { runScan, ManifestNotFoundError } from "./scan.js";
import { renderReport, renderJson } from "./report.js";

const program = new Command();

program
  .name("typosquatwatch")
  .description(
    "Pre-install dependency supply-chain guard: flags npm/PyPI packages in your manifest " +
      "that look like typosquats or AI-hallucinated (\"slopsquat\") names of popular packages."
  )
  .version("0.1.0");

program
  .command("scan", { isDefault: true })
  .description("Scan a dependency manifest for typosquat/slopsquat risk")
  .argument(
    "[path]",
    "path to a project directory, package.json, requirements.txt, or pyproject.toml",
    "."
  )
  .option("--offline", "skip network calls; use similarity heuristics only (more false positives)", false)
  .option("--json", "print machine-readable JSON instead of a colored report", false)
  .option(
    "--fail-on <level>",
    "exit non-zero if any finding meets or exceeds this severity: high, medium, low",
    "high"
  )
  .action(async (path: string, opts: { offline: boolean; json: boolean; failOn: string }) => {
    try {
      const result = await runScan(path, { offline: opts.offline });

      if (opts.json) {
        console.log(renderJson(result));
      } else {
        console.log(renderReport(result));
      }

      const failLevels: Record<string, string[]> = {
        high: ["HIGH_RISK"],
        medium: ["HIGH_RISK", "MEDIUM_RISK"],
        low: ["HIGH_RISK", "MEDIUM_RISK", "LOW_RISK"],
      };
      const triggeringLevels = failLevels[opts.failOn.toLowerCase()] ?? failLevels.high;
      const shouldFail = result.findings.some((f) => triggeringLevels.includes(f.verdict));
      process.exitCode = shouldFail ? 1 : 0;
    } catch (err) {
      if (err instanceof ManifestNotFoundError) {
        console.error(chalk.red(err.message));
        process.exitCode = 2;
        return;
      }
      console.error(chalk.red(`Unexpected error: ${err instanceof Error ? err.stack : err}`));
      process.exitCode = 2;
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red(`Fatal error: ${err instanceof Error ? err.stack : err}`));
  process.exitCode = 2;
});
