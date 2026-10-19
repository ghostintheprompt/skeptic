/**
 * Skeptic CI mode.
 *
 * The web app is deliberately human-in-the-loop (see README's "Security
 * Advisory System, not an autonomous patcher"). This script is the
 * automation layer on top of the same Prover-Skeptic-Judge pipeline in
 * aiService.ts: it runs unattended in a pipeline, reports what it found,
 * and fails the build on real findings — it never writes or commits a fix.
 * The gate decision stays a report, not a patch, same philosophy as the
 * interactive app, just without a human clicking through it file by file.
 *
 * Usage:
 *   npm run audit:ci -- <file1> <file2> ...
 *   npm run audit:ci -- --diff origin/main   # audits files changed vs a ref
 *
 * Gate: fails (exit 1) if any finding has severity CRITICAL or HIGH and
 * confidence > SKEPTIC_CI_THRESHOLD (default 0.8 — the same cutoff the
 * Judge prompt itself uses to mean "finding stands after rebuttal," not an
 * arbitrary CI-specific number).
 *
 * Writes a JSON report (skeptic-report.json) and a markdown summary
 * (skeptic-report.md) to the working directory — the markdown is meant to
 * be posted as a PR comment by the calling workflow, this script doesn't
 * talk to GitHub itself.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { auditFile, type SecurityFinding } from "../aiService.js";
import { resolveProvider } from "../providers.js";

const GATE_SEVERITIES = new Set(["CRITICAL", "HIGH"]);
const THRESHOLD = Number(process.env.SKEPTIC_CI_THRESHOLD ?? 0.8);
// Each audited file costs 3 sequential LLM calls (Prover, Skeptic, Judge).
// Auditing files one at a time makes a 40-file PR diff take as long as 40
// sequential 3-call chains; a small worker pool lets independent files run
// concurrently without unbounded fan-out against the provider's rate limits.
const CONCURRENCY = Number(process.env.SKEPTIC_CI_CONCURRENCY ?? 4);

interface FileResult {
  file: string;
  findings: SecurityFinding[];
  error?: string;
}

function resolveTargetFiles(args: string[]): string[] {
  const diffIndex = args.indexOf("--diff");
  if (diffIndex !== -1) {
    const baseRef = args[diffIndex + 1];
    if (!baseRef) {
      throw new Error("--diff requires a base ref, e.g. --diff origin/main");
    }
    const output = execSync(`git diff --name-only --diff-filter=ACM ${baseRef}...HEAD`, {
      encoding: "utf-8",
    });
    return output
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean)
      .filter((f) => fs.existsSync(f) && fs.statSync(f).isFile());
  }

  return args.filter((a) => !a.startsWith("--"));
}

function gateFinding(finding: SecurityFinding): boolean {
  return GATE_SEVERITIES.has(finding.severity) && finding.confidence > THRESHOLD;
}

function toMarkdown(results: FileResult[], gated: boolean): string {
  const lines: string[] = ["# Skeptic CI audit", ""];
  const totalFindings = results.reduce((n, r) => n + r.findings.length, 0);

  lines.push(
    gated
      ? "**Result: FAILED** — one or more findings met the gate threshold."
      : "**Result: passed** — no findings met the gate threshold."
  );
  lines.push("");
  lines.push(`Files audited: ${results.length}. Total findings: ${totalFindings}.`);
  lines.push("");

  for (const result of results) {
    if (result.error) {
      lines.push(`### \`${result.file}\` — audit error`);
      lines.push("```");
      lines.push(result.error);
      lines.push("```");
      lines.push("");
      continue;
    }
    if (result.findings.length === 0) continue;

    lines.push(`### \`${result.file}\``);
    for (const finding of result.findings) {
      const gatedMark = gateFinding(finding) ? " 🚫 GATE" : "";
      lines.push(`- **${finding.severity}** (confidence ${finding.confidence.toFixed(2)})${gatedMark}: ${finding.title}`);
      lines.push(`  ${finding.description}`);
    }
    lines.push("");
  }

  if (totalFindings === 0) {
    lines.push("No findings on any audited file.");
  }

  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const files = resolveTargetFiles(args);

  if (files.length === 0) {
    console.log("No files to audit. Exiting cleanly.");
    process.exit(0);
  }

  const provider = resolveProvider();
  console.log(`Skeptic CI audit — provider: ${provider}, files: ${files.length}, gate threshold: ${THRESHOLD}`);

  const results: FileResult[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < files.length) {
      const file = files[nextIndex++];
      try {
        const content = fs.readFileSync(file, "utf-8");
        const { findings } = await auditFile(file, content, provider);
        results.push({ file, findings });
        console.log(`  ${file} ... ${findings.length} finding(s)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ file, findings: [], error: message });
        console.log(`  ${file} ... ERROR: ${message}`);
      }
    }
  }

  const workerCount = Math.min(CONCURRENCY, files.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const gated = results.some((r) => r.findings.some(gateFinding));

  fs.writeFileSync(
    path.join(process.cwd(), "skeptic-report.json"),
    JSON.stringify({ provider, ranAt: new Date().toISOString(), threshold: THRESHOLD, gated, results }, null, 2)
  );
  fs.writeFileSync(path.join(process.cwd(), "skeptic-report.md"), toMarkdown(results, gated));

  console.log(`\nReport written to skeptic-report.json and skeptic-report.md`);

  if (gated) {
    console.log(`\nGATE FAILED: a finding with severity in {${[...GATE_SEVERITIES].join(", ")}} and confidence > ${THRESHOLD} was found.`);
    process.exit(1);
  }

  console.log("\nGate passed: no finding met the severity/confidence threshold.");
}

main().catch((error) => {
  console.error("Skeptic CI audit failed to run:", error instanceof Error ? error.message : error);
  process.exit(1);
});
