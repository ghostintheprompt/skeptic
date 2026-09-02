import { Type } from "@google/genai";
import { z } from "zod";
import { generateText, generateJSON, resolveProvider, type Provider } from "./providers.js";

export interface SecurityFinding {
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  evidence: string;
  file: string;
  line?: number;
  confidence: number;
  reasoning: string;
}

export interface ScopingReport {
  projectOverview: string;
  techStack: string[];
  attackSurfaces: string[];
  highRiskFiles: string[];
  estimatedRiskScore: number; // 0-100
}

const ScopingReportSchema = z.object({
  projectOverview: z.string(),
  techStack: z.array(z.string()),
  attackSurfaces: z.array(z.string()),
  highRiskFiles: z.array(z.string()),
  estimatedRiskScore: z.number(),
});

const ScopingReportGeminiSchema = {
  type: Type.OBJECT,
  properties: {
    projectOverview: { type: Type.STRING },
    techStack: { type: Type.ARRAY, items: { type: Type.STRING } },
    attackSurfaces: { type: Type.ARRAY, items: { type: Type.STRING } },
    highRiskFiles: { type: Type.ARRAY, items: { type: Type.STRING } },
    estimatedRiskScore: { type: Type.NUMBER },
  },
  required: ["projectOverview", "techStack", "attackSurfaces", "highRiskFiles", "estimatedRiskScore"],
};

const SecurityFindingSchema = z.object({
  title: z.string(),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  description: z.string(),
  evidence: z.string(),
  file: z.string(),
  line: z.number().optional(),
  confidence: z.number(),
  reasoning: z.string(),
});

const FindingsListSchema = z.array(SecurityFindingSchema);

const FindingsListGeminiSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      severity: { type: Type.STRING, enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
      description: { type: Type.STRING },
      evidence: { type: Type.STRING },
      file: { type: Type.STRING },
      line: { type: Type.NUMBER },
      confidence: { type: Type.NUMBER },
      reasoning: { type: Type.STRING },
    },
    required: ["title", "severity", "description", "evidence", "file", "confidence", "reasoning"],
  },
};

const ResearchQueriesSchema = z.array(z.string());
const ResearchQueriesGeminiSchema = { type: Type.ARRAY, items: { type: Type.STRING } };

export async function scopeProject(
  files: string[],
  provider: Provider = resolveProvider()
): Promise<ScopingReport> {
  console.log(`[AI:${provider}] Starting project scoping...`);
  const prompt = `Analyze the following file structure for a repository and provide a scoping report and a risk score (0-100).
  A high risk score (80+) implies complex business logic, sensitive patterns (auth, crypto), or legacy structures.

  Files:
  ${files.join("\n")}

  Focus on identifying the primary tech stack, entry points, and likely attack surfaces.`;

  try {
    const report = await generateJSON<ScopingReport>(prompt, ScopingReportSchema, ScopingReportGeminiSchema, provider);
    console.log(`[AI:${provider}] Scoping response received.`);
    return report;
  } catch (error) {
    console.error(`[AI:${provider}] Scoping Error:`, error);
    throw error;
  }
}

function proverPrompt(fileName: string, content: string): string {
  return `You are an elite Security Auditor (The Prover).
  Scan the file "${fileName}" for vulnerabilities and AI-generation artifacts.

  Code Content:
  ${content}

  Focus on:
  1. Traditional Sec: Injection, Broken Auth, Crypto failures.
  2. AI Pitfalls:
     - "Ghost Methods": Non-existent library calls.
     - "Sanitization Theater": Hallucinated security wrappers that don't exist.
     - "Orphaned State": Global variables that leak or aren't used.
     - "Lazy Logic": Incomplete implementations or "FIXME" markers.

  Format your findings as a list of potential issues.`;
}

function skepticPrompt(fileName: string, proverText: string): string {
  return `You are a Senior AppSec Defensive Engineer (The Skeptic).
  Review the following findings for file "${fileName}".
  Your goal is to PROVE these findings are false positives, dead code, or harmless hallucinations.

  Findings:
  ${proverText}

  Check for:
  - Framework Isolation: Is the "vulnerability" in a dead or unreachable file?
  - Dead Code: Is the orphaned variable actually security-relevant or just junk?
  - Mocked Security: If the Prover says sanitization is missing, verify if the framework does it automatically.

  Provide a rebuttal for each finding.`;
}

function judgePrompt(fileName: string, proverText: string, skepticText: string): string {
  return `You are the Lead Security Architect. You must reconcile the arguments from a Security Auditor (Prover) and a Defense Engineer (Skeptic).

  File: ${fileName}
  Prover Findings: ${proverText}
  Skeptic Rebuttals: ${skepticText}

  Your task:
  1. If the Skeptic successfully debunked a finding, discard it or lower confidence to < 0.2.
  2. If the Prover's finding stands even after rebuttal, keep it and set confidence > 0.8.
  3. Provide a final "Reasoning" explaining the consensus.

  Format as JSON only.`;
}

/**
 * Runs just the Prover phase. Exposed separately (not only as part of
 * auditFile) so the eval harness can score the Prover in isolation against
 * the full Prover-Skeptic-Judge pipeline — that comparison is the whole
 * point of the Chain of Verification claim.
 */
export async function proveFile(
  fileName: string,
  content: string,
  provider: Provider = resolveProvider()
): Promise<string> {
  console.log(`[AI:${provider}] Prover scanning: ${fileName}...`);
  return generateText(proverPrompt(fileName, content), provider);
}

export async function auditFile(
  fileName: string,
  content: string,
  provider: Provider = resolveProvider()
): Promise<{ findings: SecurityFinding[]; logs: { prover: string; skeptic: string } }> {
  console.log(`[AI:${provider}] Auditing file: ${fileName}...`);

  const proverText = await proveFile(fileName, content, provider);
  console.log(`[AI:${provider}] Prover response received.`);

  const skepticText = await generateText(skepticPrompt(fileName, proverText), provider);
  console.log(`[AI:${provider}] Skeptic response received.`);

  const findings = await generateJSON<SecurityFinding[]>(
    judgePrompt(fileName, proverText, skepticText),
    FindingsListSchema,
    FindingsListGeminiSchema,
    provider
  );
  console.log(`[AI:${provider}] Judge response received.`);

  return {
    findings,
    logs: { prover: proverText, skeptic: skepticText },
  };
}

export async function refactorCode(
  finding: SecurityFinding,
  content: string,
  provider: Provider = resolveProvider()
): Promise<{ mitigation: string; critique: string; researchQueries: string[] }> {
  console.log(`[AI:${provider}] Generating refactor for: ${finding.title}...`);

  const mitigationPrompt = `You are a Senior Security Engineer.
  Provide a secure refactor for the following vulnerability.

  Vulnerability: ${finding.title}
  AI Reasoning for Finding: ${finding.reasoning}

  Original Code:
  ${content}

  Focus on high-fidelity, production-ready code. Provide only the code in a markdown block.`;

  const mitigationCode = await generateText(mitigationPrompt, provider);

  const critiquePrompt = `You are a Senior AppSec Defensive Engineer (The Skeptic).
  Review the following proposed security fix for a ${finding.title} vulnerability.

  Proposed Fix:
  ${mitigationCode}

  Your goal is to be brutally honest. Call out any:
  - "Stupid" or redundant logic.
  - Potential side effects or regressions this fix might cause.
  - "Shaky" assumptions (e.g., assuming a library is present or an input is already sanitized).
  - Common AI patterns that might be technically correct but practically fragile.

  Format as a concise technical critique for a human lead architect.`;

  const critique = await generateText(critiquePrompt, provider);

  const researchPrompt = `Based on the vulnerability "${finding.title}" and the proposed fix, provide 3 specific research queries or topics the human developer should look up on OWASP, MDN, or GitHub to independently verify this solution.

  Format as a JSON array of strings only.`;

  const researchQueries = await generateJSON<string[]>(
    researchPrompt,
    ResearchQueriesSchema,
    ResearchQueriesGeminiSchema,
    provider
  );

  return { mitigation: mitigationCode, critique, researchQueries };
}
