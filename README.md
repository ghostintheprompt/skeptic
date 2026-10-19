<div align="center">
  <img src="icon.png" width="500" alt="Skeptic Logo">
  <h1>Skeptic</h1>
</div>

Skeptic is a security auditor built specifically to identify vulnerabilities and hallucinations in AI-generated code. It employs a **Chain of Verification** (Prover-Skeptic-Judge) workflow to distinguish between valid security risks and AI-induced artifacts — and it measures whether that workflow actually works, rather than just asserting it (see [Evaluation](#evaluation)).

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Web-green.svg)](#)
[![Release](https://img.shields.io/badge/release-v1.2.0-orange.svg)](https://github.com/ghostintheprompt/skeptic/releases)

## The Problem: AI Hallucinations

AI coding assistants frequently introduce security pitfalls that traditional static analysis tools miss:
- **Ghost Methods:** Calls to non-existent library functions or APIs.
- **Sanitization Theater:** Hallucinated security wrappers that appear valid but provide no actual protection.
- **Orphaned State:** Leaked variables or incomplete logic ("FIXME" markers) that create silent vulnerabilities.

## The Solution: Chain of Verification

Skeptic reconciles these issues using three specialized agents:
1. **The Prover:** An aggressive auditor that identifies potential vulnerabilities and AI artifacts.
2. **The Skeptic:** A defensive engineer that attempts to debunk findings as false positives or harmless hallucinations.
3. **The Judge:** A Lead Architect that reconciles both arguments to provide a final confidence score and technical reasoning.

## Security Advisory Philosophy

Skeptic operates as a **Security Advisory System**, not an autonomous patcher. We recognize the irony of using AI to fix AI-generated errors; therefore, Skeptic is built on three pillars of transparency:

1. **AI Self-Critique:** Every suggested mitigation is immediately re-audited by a secondary agent to identify "shaky" logic, redundant patterns, or fragile assumptions in the proposed fix.
2. **The Skeptic's Critique:** Users are presented with both the suggested code and a brutally honest critique of its potential weaknesses.
3. **Independent Verification:** Skeptic provides targeted research queries for OWASP and MDN, empowering the human lead architect to verify the solution through trusted documentation before implementation.

## Automation / CI Mode

The interactive app is deliberately human-in-the-loop — same philosophy
holds in CI. `cli/audit-ci.ts` runs the same Prover-Skeptic-Judge pipeline
unattended against changed files, writes a report, and **gates the build**
on real findings; it never writes or commits a fix itself.

```bash
npm run audit:ci -- --diff origin/main    # audits files changed vs a ref
npm run audit:ci -- src/app.ts src/db.ts  # or an explicit file list
```

Gate: fails (exit 1) if any finding is `CRITICAL`/`HIGH` severity with
confidence above `SKEPTIC_CI_THRESHOLD` (default `0.8` — the same cutoff
the Judge prompt itself uses for "finding stands after rebuttal," not an
arbitrary CI number). Writes `skeptic-report.json` and
`skeptic-report.md` for a workflow to upload or post as a PR comment.
See [.github/workflows/skeptic-audit.yml](.github/workflows/skeptic-audit.yml)
for a working example.

Files audit concurrently (`SKEPTIC_CI_CONCURRENCY`, default `4`) — each
file costs 3 sequential LLM calls (Prover, Skeptic, Judge), so auditing a
large PR diff one file at a time would make the gate itself the slowest
part of CI.

## New in v1.2.0

- **Model-Agnostic:** Claude and Gemini are both first-class backends now (`ANTHROPIC_API_KEY` and/or `GEMINI_API_KEY` — Claude runs when both are set). The Prover-Skeptic-Judge method shouldn't depend on which model plays each role, so it doesn't.
- **An actual eval:** `npm run eval` runs the pipeline against a 16-case labeled fixture set and reports Prover-only vs. full-pipeline precision/recall. See [Evaluation](#evaluation).

## New in v1.1.0

- **Zero-Trust Architecture:** AI calls are now executed on the backend, ensuring your API keys never reach the browser.
- **In-App Configuration:** Manage your GitHub and model-provider credentials directly through the new Settings panel.
- **Interactive Scoping:** After the initial toxicity scan, you can hand-pick which files to deep-audit.
- **Security Advisory System:** Structured mitigations with built-in self-critique and research paths.
- **Live Reasoning Logs:** Watch the Prover and Skeptic debate in real-time through the audit console.

## Features

| Feature | Description |
| --- | --- |
| **Artifact Detection** | Specifically scans for Ghost Methods and Sanitization Theater. |
| **Multi-Agent Audit** | Uses Prover-Skeptic-Judge reasoning, measured (not just claimed) to reduce false positives — see [Evaluation](#evaluation). |
| **Code Toxicity Scoring** | Initial scoping to prioritize high-risk files and entry points. |
| **Human-in-the-loop** | Built-in self-critique loop to prevent AI-induced regressions. |
| **Secure Secrets** | Server-side persistence for API keys and OAuth secrets. |

## Evaluation

Does the Skeptic phase actually catch what it claims to catch? `eval/` holds a 16-case labeled fixture set (8 real vulnerabilities, 8 false-positive bait) and a harness that reports Prover-only vs. full-pipeline precision/recall/F1:

```bash
npm run eval              # auto-picks provider from configured keys
npm run eval -- claude    # force Claude
npm run eval -- gemini    # force Gemini
```

Full methodology, what the numbers do and don't show, and how to read a result honestly: [docs/EVAL.md](docs/EVAL.md).

## Installation

### Build from Source
1. Clone the repository:
   ```bash
   git clone https://github.com/ghostintheprompt/skeptic.git
   cd skeptic
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open the app and enter your credentials in the **Settings** panel.

## Privacy Statement
Skeptic is **local-only**. No telemetry, no tracking, and no data collection. Your code stays between you and whichever model provider you've configured.

---
Built by [MDRN Corp](https://mdrn.app) — [mdrn.app](https://mdrn.app)
