/**
 * Skeptic eval harness.
 *
 * Runs the full audit pipeline against a labeled fixture set and reports
 * Prover-only vs. Prover-Skeptic-Judge precision/recall/F1. This is the
 * thing the README's "measured (not just claimed) to reduce false
 * positives" line needs to actually back it up - see docs/EVAL.md for the
 * read on what a low prover-only precision + high full-pipeline precision
 * would mean (and what it wouldn't).
 *
 * Usage:
 *   npm run eval              # auto-picks provider from configured keys
 *   npm run eval -- claude    # force Claude
 *   npm run eval -- gemini    # force Gemini
 *
 * Requires ANTHROPIC_API_KEY and/or GEMINI_API_KEY in the environment or a
 * local .env - this makes real, billed API calls (48 calls for the default
 * 16-case set: 3 per case - Prover, Skeptic, Judge).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DATASET } from "./dataset.js";
import { auditFile, type SecurityFinding } from "../aiService.js";
import { resolveProvider, type Provider } from "../providers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "fixtures");
const RESULTS_DIR = path.join(__dirname, "results");

// Heuristic only: the Prover returns free-form prose, not structured JSON,
// so "did the Prover flag this file" is a keyword read on its own text, not
// a hard classifier. It exists to give the Judge phase something to be
// measured against, not as a standalone detector.
const FLAG_SIGNAL = /(critical|high severity|vulnerab|injection|hardcoded|weak crypto|broken auth|ghost method|sanitization theater|orphaned|lazy logic|hallucinat)/i;
const CLEAR_SIGNAL = /no\s+(vulnerabilit(?:y|ies)|issues?|findings?|security concerns?)\s*(?:were|was)?\s*(?:found|identified|detected)/i;

// Known limitation, confirmed 2026-10-11 running a real 16-fixture eval by
// hand (no API key that day; 16 blind subagents stood in for the model
// calls): the Prover prompt explicitly instructs checking four named
// AI-pitfall categories - "Ghost Methods," "Sanitization Theater,"
// "Orphaned State," "Lazy Logic." A careful Prover correctly clearing a
// file says so by name ("Sanitization Theater: none found," "No ghost
// methods or orphaned state were found"), and this bare substring match
// can't tell that apart from an actual finding - every one of the 8 clean
// fixtures in that run tripped FLAG_SIGNAL for exactly this reason,
// pushing Prover-only precision to ~0.5 regardless of the Prover's actual
// judgment quality. A per-sentence negation check was tried as a fix and
// reverted: on the same real transcripts it dropped Prover-only recall
// from 1.00 to 0.75, because real findings routinely use negation inside
// their own description ("crypto.hashSync does NOT exist" IS the
// vulnerability; "MD5... with NO adaptive work factor" IS the weakness),
// and no simple regex window reliably tells that apart from a genuine
// cleared-verdict negation. Net effect was a wash on F1 (0.70 -> 0.67),
// not an improvement - left as a documented limitation rather than a
// false "fix." See docs/EVAL.md and
// src/app/articles/running-skeptics-eval-without-an-api-key.md on
// ghostintheprompt.com for the real numbers this was measured against.


function proverFlagged(proverText: string): boolean {
  if (CLEAR_SIGNAL.test(proverText)) return false;
  return FLAG_SIGNAL.test(proverText);
}

// The Judge prompt's own documented convention: debunked findings drop
// below 0.2, upheld findings rise above 0.8. 0.5 is the natural midpoint.
function judgeFlagged(findings: SecurityFinding[]): boolean {
  return findings.some((f) => f.confidence > 0.5);
}

interface CaseResult {
  id: string;
  groundTruth: "vulnerable" | "clean";
  category: string;
  proverFlagged: boolean;
  judgeFlagged: boolean;
  findingsCount: number;
  topConfidence: number | null;
  elapsedMs: number;
  error?: string;
}

interface Confusion {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

function confusion(results: CaseResult[], key: "proverFlagged" | "judgeFlagged"): Confusion {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const r of results) {
    if (r.error) continue;
    const predicted = r[key];
    const actual = r.groundTruth === "vulnerable";
    if (predicted && actual) tp++;
    else if (predicted && !actual) fp++;
    else if (!predicted && actual) fn++;
    else tn++;
  }
  const precision = tp + fp === 0 ? null : tp / (tp + fp);
  const recall = tp + fn === 0 ? null : tp / (tp + fn);
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, tn, precision, recall, f1 };
}

function fmt(n: number | null): string {
  return n === null ? "n/a" : n.toFixed(2);
}

function printConfusion(label: string, c: Confusion) {
  console.log(`\n${label}`);
  console.log(`  TP=${c.tp}  FP=${c.fp}  FN=${c.fn}  TN=${c.tn}`);
  console.log(`  precision=${fmt(c.precision)}  recall=${fmt(c.recall)}  f1=${fmt(c.f1)}`);
}

async function main() {
  const providerArg = process.argv[2] as Provider | undefined;
  const provider = resolveProvider(providerArg);

  console.log(`Skeptic eval — provider: ${provider}, cases: ${DATASET.length}`);
  console.log(`(3 LLM calls per case: Prover, Skeptic, Judge — ${DATASET.length * 3} total)\n`);

  const results: CaseResult[] = [];

  for (const testCase of DATASET) {
    const filePath = path.join(FIXTURES_DIR, testCase.file);
    const content = fs.readFileSync(filePath, "utf-8");
    const start = Date.now();
    process.stdout.write(`  ${testCase.id.padEnd(28)} `);

    try {
      const { findings, logs } = await auditFile(testCase.file, content, provider);
      const elapsedMs = Date.now() - start;
      const pFlag = proverFlagged(logs.prover);
      const jFlag = judgeFlagged(findings);
      const topConfidence = findings.length
        ? Math.max(...findings.map((f) => f.confidence))
        : null;

      results.push({
        id: testCase.id,
        groundTruth: testCase.groundTruth,
        category: testCase.category,
        proverFlagged: pFlag,
        judgeFlagged: jFlag,
        findingsCount: findings.length,
        topConfidence,
        elapsedMs,
      });

      console.log(
        `truth=${testCase.groundTruth.padEnd(10)} prover=${String(pFlag).padEnd(5)} judge=${String(jFlag).padEnd(5)} (${elapsedMs}ms)`
      );
    } catch (error) {
      const elapsedMs = Date.now() - start;
      results.push({
        id: testCase.id,
        groundTruth: testCase.groundTruth,
        category: testCase.category,
        proverFlagged: false,
        judgeFlagged: false,
        findingsCount: 0,
        topConfidence: null,
        elapsedMs,
        error: error instanceof Error ? error.message : String(error),
      });
      console.log(`ERROR: ${error instanceof Error ? error.message : error}`);
    }
  }

  const errored = results.filter((r) => r.error);
  if (errored.length) {
    console.log(`\n${errored.length}/${results.length} cases errored and are excluded from the metrics below.`);
  }

  const proverStats = confusion(results, "proverFlagged");
  const judgeStats = confusion(results, "judgeFlagged");

  console.log("\n" + "=".repeat(60));
  console.log("RESULTS");
  console.log("=".repeat(60));
  printConfusion("Prover only (heuristic read on raw Prover text)", proverStats);
  printConfusion("Full pipeline (Prover -> Skeptic -> Judge, confidence > 0.5)", judgeStats);

  console.log("\nWhat this does and doesn't show:");
  console.log("  - This is 16 fixtures, not a benchmark. Directional signal, not a leaderboard number.");
  console.log("  - Prover-only precision reflects the false-positive-bait cases; if it's low and");
  console.log("    full-pipeline precision is meaningfully higher, that's the Skeptic phase earning its cost.");
  console.log("  - If both are similar, the Skeptic/Judge phases aren't adding verification value yet");
  console.log("    and that's a real finding, not a bug in the eval.");

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = path.join(RESULTS_DIR, `${provider}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify({ provider, ranAt: new Date().toISOString(), results, proverStats, judgeStats }, null, 2)
  );
  console.log(`\nRaw results written to ${path.relative(process.cwd(), outPath)}`);
}

main().catch((error) => {
  console.error("Eval run failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
