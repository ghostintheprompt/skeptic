/**
 * Skeptic eval set.
 *
 * Each fixture is a small, realistic file with a known ground-truth label:
 * `vulnerable` files contain a real, unambiguous issue Skeptic should catch.
 * `clean` files are false-positive bait — code that superficially resembles
 * a risky pattern (by name, shape, or a nearby comment) but is actually
 * safe, so a naive pattern-matcher would flag it and a careful reviewer
 * would not.
 *
 * Each `clean` fixture deliberately mirrors a `vulnerable` one so the eval
 * measures discrimination, not just "can it find bugs": ghost-method vs.
 * env-secret-correct is an unrelated pairing on purpose — pairs are noted
 * in `mirrors` where they exist.
 */

export type GroundTruth = "vulnerable" | "clean";

export interface EvalCase {
  id: string;
  file: string; // relative to eval/fixtures/
  groundTruth: GroundTruth;
  category: string;
  mirrors?: string; // id of the fixture this one is a false-positive-bait counterpart to
  note: string;
}

export const DATASET: EvalCase[] = [
  {
    id: "sql-injection",
    file: "sql-injection.ts",
    groundTruth: "vulnerable",
    category: "injection",
    mirrors: "parameterized-query",
    note: "String-concatenated SQL query built directly from user input.",
  },
  {
    id: "hardcoded-secret",
    file: "hardcoded-secret.ts",
    groundTruth: "vulnerable",
    category: "secrets",
    mirrors: "env-secret-correct",
    note: "Live-looking API key committed directly in source.",
  },
  {
    id: "ghost-method",
    file: "ghost-method.ts",
    groundTruth: "vulnerable",
    category: "ai-artifact",
    note: "Calls crypto.hashSync, which does not exist on Node's crypto module - a hallucinated API.",
  },
  {
    id: "sanitization-theater",
    file: "sanitization-theater.ts",
    groundTruth: "vulnerable",
    category: "ai-artifact",
    mirrors: "real-sanitizer",
    note: "sanitizeInput() only trims whitespace; output is still interpolated unescaped into HTML.",
  },
  {
    id: "broken-auth",
    file: "broken-auth.ts",
    groundTruth: "vulnerable",
    category: "auth",
    mirrors: "constant-time-compare",
    note: "Non-constant-time string equality on a password/secret comparison.",
  },
  {
    id: "weak-crypto",
    file: "weak-crypto.ts",
    groundTruth: "vulnerable",
    category: "crypto",
    mirrors: "strong-crypto",
    note: "MD5 used for password hashing - fast to brute-force, no adaptive cost factor.",
  },
  {
    id: "path-traversal",
    file: "path-traversal.ts",
    groundTruth: "vulnerable",
    category: "injection",
    note: "path.join with an unsanitized filename allows ../ escape out of the uploads directory.",
  },
  {
    id: "orphaned-state",
    file: "orphaned-state.ts",
    groundTruth: "vulnerable",
    category: "ai-artifact",
    note: "Module-level mutable session token is shared across all concurrent requests/users on the server.",
  },
  {
    id: "env-secret-correct",
    file: "env-secret-correct.ts",
    groundTruth: "clean",
    category: "secrets",
    mirrors: "hardcoded-secret",
    note: "Secret is correctly read from env with a startup guard - no hardcoded credential.",
  },
  {
    id: "dead-code-todo",
    file: "dead-code-todo.ts",
    groundTruth: "clean",
    category: "ai-artifact",
    note: "TODO sits behind a hardcoded `false` flag - provably unreachable, not a live gap.",
  },
  {
    id: "real-sanitizer",
    file: "real-sanitizer.ts",
    groundTruth: "clean",
    category: "ai-artifact",
    mirrors: "sanitization-theater",
    note: "escapeHtml() genuinely escapes the five HTML metacharacters before interpolation.",
  },
  {
    id: "parameterized-query",
    file: "parameterized-query.ts",
    groundTruth: "clean",
    category: "injection",
    mirrors: "sql-injection",
    note: "Uses a parameterized query ($1) - the driver handles escaping, not string concatenation.",
  },
  {
    id: "framework-auto-escaped",
    file: "framework-auto-escaped.ts",
    groundTruth: "clean",
    category: "injection",
    note: "React.createElement text children are escaped by React - not raw HTML interpolation.",
  },
  {
    id: "orphaned-var-benign",
    file: "orphaned-var-benign.ts",
    groundTruth: "clean",
    category: "ai-artifact",
    note: "Unused local variable with zero security relevance - dead code, not a leak.",
  },
  {
    id: "strong-crypto",
    file: "strong-crypto.ts",
    groundTruth: "clean",
    category: "crypto",
    mirrors: "weak-crypto",
    note: "bcrypt with a reasonable cost factor - the correct primitive for password hashing.",
  },
  {
    id: "constant-time-compare",
    file: "constant-time-compare.ts",
    groundTruth: "clean",
    category: "auth",
    mirrors: "broken-auth",
    note: "Uses crypto.timingSafeEqual with a length check - the correct constant-time pattern.",
  },
];
