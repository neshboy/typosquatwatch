import chalk from "chalk";
import type { ScanFinding, ScanResult, Verdict } from "./types.js";

function verdictBadge(verdict: Verdict): string {
  switch (verdict) {
    case "HIGH_RISK":
      return chalk.bgRed.white.bold(" HIGH RISK ");
    case "MEDIUM_RISK":
      return chalk.bgYellow.black.bold(" MEDIUM RISK ");
    case "LOW_RISK":
      return chalk.bgGray.white.bold(" LOW RISK ");
    default:
      return chalk.bgBlue.white.bold(" ? ");
  }
}

function formatFinding(finding: ScanFinding): string {
  const lines: string[] = [];
  const { dependency, bestMatch, reasons, score, verdict } = finding;

  lines.push(
    `${verdictBadge(verdict)} ${chalk.bold(dependency.name)}${chalk.dim(`@${dependency.versionRange}`)} ` +
      chalk.dim(`(${dependency.section}, score ${score.toFixed(2)})`)
  );
  if (bestMatch) {
    lines.push(
      `  ${chalk.dim("looks like")} ${chalk.green.bold(bestMatch.popularName)} ${chalk.dim(
        `(${(bestMatch.similarity * 100).toFixed(0)}% similar, edit distance ${bestMatch.distance})`
      )}`
    );
  }
  for (const reason of reasons) {
    lines.push(`  ${chalk.dim("-")} ${reason}`);
  }
  return lines.join("\n");
}

export function renderReport(result: ScanResult): string {
  const lines: string[] = [];
  lines.push(
    chalk.bold(
      `TyposquatWatch scan — ${result.manifestPath} (${result.ecosystem}, ${result.totalDependencies} dependencies checked${
        result.offline ? ", offline mode" : ""
      })`
    )
  );
  lines.push("");

  if (result.findings.length === 0) {
    lines.push(chalk.green("No suspicious dependencies found."));
    return lines.join("\n");
  }

  const byVerdict = { HIGH_RISK: 0, MEDIUM_RISK: 0, LOW_RISK: 0 };
  for (const f of result.findings) byVerdict[f.verdict]++;

  lines.push(
    chalk.bold(
      `${result.findings.length} package(s) flagged for review: ` +
        `${chalk.red(`${byVerdict.HIGH_RISK} high`)}, ` +
        `${chalk.yellow(`${byVerdict.MEDIUM_RISK} medium`)}, ` +
        `${chalk.gray(`${byVerdict.LOW_RISK} low`)}`
    )
  );
  lines.push("");

  const sorted = [...result.findings].sort((a, b) => b.score - a.score);
  for (const finding of sorted) {
    lines.push(formatFinding(finding));
    lines.push("");
  }

  if (result.offline) {
    lines.push(
      chalk.dim(
        "Note: offline mode only used name-similarity heuristics (no registry download/age checks). " +
          "Expect more false positives than an online scan — see README Limitations."
      )
    );
  }

  return lines.join("\n").trimEnd();
}

export function renderJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}
