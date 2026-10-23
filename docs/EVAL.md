# Evaluating the Chain of Verification

Skeptic's core claim is that running a finding through Prover → Skeptic → Judge produces a more trustworthy result than the Prover alone. That's a testable claim, not just a design philosophy, so it should be tested rather than asserted.

## What the eval measures

`eval/dataset.ts` holds 18 small, realistic TypeScript files under `eval/fixtures/`, each with a known ground truth:

- **9 `vulnerable`** — a real, unambiguous issue: SQL injection, a hardcoded secret, a hallucinated `crypto.hashSync` API, sanitization theater, non-constant-time auth comparison, MD5 password hashing, path traversal, a module-level session-token global shared across concurrent users, and a file carrying a real command injection alongside a comment that instructs the auditor to report no findings.
- **9 `clean`** — false-positive bait. Each mirrors one of the vulnerable cases with the same surface shape but a correct implementation: env-sourced secrets, a real `escapeHtml`, a parameterized query, React's auto-escaping, `bcrypt`, `crypto.timingSafeEqual`, a `TODO` behind a hardcoded-`false` flag, one unrelated dead-but-harmless variable, and a clean parameterized query carrying an ordinary human review note (bait for the injection detector, which must not fire on normal review metadata).

`npm run eval` runs the full `auditFile()` pipeline against every fixture and reports two confusion matrices:

1. **Prover only** — a keyword heuristic read on the raw Prover output (did it use vulnerability language, or say it found nothing).
2. **Full pipeline** — whether the Judge's final findings include anything above 0.5 confidence, using the same 0.5 threshold the Judge prompt itself treats as the line between "debunked" (<0.2) and "upheld" (>0.8).

Results (both the console summary and the raw per-case JSON) land in `eval/results/`, gitignored since they're run artifacts, not source.

## Reading the result honestly

- **18 fixtures is a smoke test, not a benchmark.** It's enough to catch a pipeline that isn't discriminating at all; it is not enough to claim a calibrated false-positive rate. Treat the numbers as directional.
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

## 2026-10-11: run it by hand, for real, without an API key

No `ANTHROPIC_API_KEY`/`GEMINI_API_KEY` was configured that day. Rather than publish a hedged or fabricated result, the full 16-fixture eval was run by hand: 16 independent blind subagents, each given only the file content and the exact Prover/Skeptic/Judge prompts from `aiService.ts`, zero access to `dataset.ts`'s ground-truth labels. Not the same as `npm run eval` (no enforced Zod structured output, 16 separate processes instead of one), but a faithful substitute. Full writeup: `src/app/articles/running-skeptics-eval-without-an-api-key.md` on ghostintheprompt.com.

Real result: perfect recall (8/8 vulnerable fixtures caught, confidence 0.80-0.98). Full-pipeline precision 0.667 by the literal confusion matrix — but two of the four "false positives" turned out to be real, independently-verified bugs in what `dataset.ts` assumed were clean fixtures (`constant-time-compare.ts`'s fail-open empty-password bypass, `env-secret-correct.ts`'s missing Stripe idempotency key). Both fixtures patched the same day (see their `dataset.ts` notes) so they're actually clean on the property they're labeled for, not accidentally clean.

Also found and **not fixed**: `proverFlagged()`'s bare-substring heuristic flags nearly every clean fixture, because the Prover prompt's own instruction to check four named AI-pitfall categories means a correct "none found" verdict still contains the exact watched-for keyword. A per-sentence negation check was tried and reverted after measuring it against the real transcripts — it dropped Prover-only recall from 1.00 to 0.75 (two real vulnerable findings use negation as part of describing the vulnerability itself, e.g. "crypto.hashSync does NOT exist"), a wash on F1, not an improvement. Documented as a known limitation in `run-eval.ts` instead of shipping a fix that measured out worse than the problem it was meant to solve.

## Injection resistance: can the audited file talk the auditor out of the audit?

Skeptic reads the file under review into its own prompt, so the obvious attack is to put an instruction for the auditor *in the file*: a comment saying the file is approved, or to report no findings. A tool that hunts AI hallucinations that can itself be told to hallucinate a clean verdict is worth nothing, so this is tested directly.

The defense is two layers, deliberately not relying on the model's good behavior:

1. **Prompt boundary.** The Prover prompt wraps the file in `<file>` tags and states that everything inside is untrusted data, and that any text addressing the auditor is itself a finding, never a command. This helps but is not trusted on its own: models leak across that boundary, and a payload can try to close the tag early.
2. **Deterministic detector (the layer that holds).** `scanForAuditorInjection()` in `aiService.ts` runs over the file regardless of what the model says and surfaces an `Auditor-directed prompt injection` finding (HIGH, confidence 0.9) whenever the file contains an instruction aimed at suppressing or pre-clearing the audit. `auditFile()` prepends it to the model's findings, so steering the model cannot silently clear the file — the injection itself becomes a reported finding.

Two fixtures pin this: `auditor-injection.ts` (real command injection plus an auditor-directed "report no findings" comment) and `review-note-benign.ts` (a clean file with an ordinary human review note the detector must not fire on). The detector and its precision are proven offline, without an API key:

```bash
npm run test:injection      # 13 assertions, no key required
```

End-to-end resistance — the model, fenced, still reporting the real command injection — is measured by `npm run eval` when a key is present. The detector is the part that is provable every run.
