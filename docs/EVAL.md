# Evaluating the Chain of Verification

Skeptic's core claim is that running a finding through Prover → Skeptic → Judge produces a more trustworthy result than the Prover alone. That's a testable claim, not just a design philosophy, so it should be tested rather than asserted.

## What the eval measures

`eval/dataset.ts` holds 16 small, realistic TypeScript files under `eval/fixtures/`, each with a known ground truth:

- **8 `vulnerable`** — a real, unambiguous issue: SQL injection, a hardcoded secret, a hallucinated `crypto.hashSync` API, sanitization theater, non-constant-time auth comparison, MD5 password hashing, path traversal, and a module-level session-token global shared across concurrent users.
- **8 `clean`** — false-positive bait. Each mirrors one of the vulnerable cases with the same surface shape but a correct implementation: env-sourced secrets, a real `escapeHtml`, a parameterized query, React's auto-escaping, `bcrypt`, `crypto.timingSafeEqual`, a `TODO` behind a hardcoded-`false` flag, and one unrelated dead-but-harmless variable.

`npm run eval` runs the full `auditFile()` pipeline against every fixture and reports two confusion matrices:

1. **Prover only** — a keyword heuristic read on the raw Prover output (did it use vulnerability language, or say it found nothing).
2. **Full pipeline** — whether the Judge's final findings include anything above 0.5 confidence, using the same 0.5 threshold the Judge prompt itself treats as the line between "debunked" (<0.2) and "upheld" (>0.8).

Results (both the console summary and the raw per-case JSON) land in `eval/results/`, gitignored since they're run artifacts, not source.

## Reading the result honestly

- **16 fixtures is a smoke test, not a benchmark.** It's enough to catch a pipeline that isn't discriminating at all; it is not enough to claim a calibrated false-positive rate. Treat the numbers as directional.
- **The Prover-only heuristic is a heuristic.** The Prover returns prose, not structured output, so "flagged" is a keyword match, not a classifier. It's there to give the full pipeline something to be measured against — a system that can't beat a keyword grep isn't earning its extra API calls.
- **A real possible outcome is "the Skeptic/Judge phases aren't adding much yet."** If prover-only and full-pipeline precision come out close, that's a finding about the prompts, not a bug in the eval — and it's more useful to know than a number that was never measured.
- **Cost is part of the result.** Full pipeline is 3 LLM calls per file (Prover, Skeptic, Judge) against 1 for a naive scanner. The eval's timing numbers make that tradeoff visible instead of hand-waved.

## Running it

```bash
# needs ANTHROPIC_API_KEY and/or GEMINI_API_KEY set (or in .env)
npm run eval              # auto-picks provider from configured keys
npm run eval -- claude    # force Claude
npm run eval -- gemini    # force Gemini
```

Running it against both providers on the same fixture set is the natural next step once one set of numbers exists — same method, same dataset, different model in the Prover/Skeptic/Judge seat.
