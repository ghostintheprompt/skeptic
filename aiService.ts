import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

function getAI() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
}

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

export async function scopeProject(files: string[]): Promise<ScopingReport> {
  const ai = getAI();
  const prompt = `Analyze the following file structure for a repository and provide a scoping report and a risk score (0-100).
  A high risk score (80+) implies complex business logic, sensitive patterns (auth, crypto), or legacy structures.
  
  Files:
  ${files.join("\n")}
  
  Focus on identifying the primary tech stack, entry points, and likely attack surfaces.`;

  const result = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          projectOverview: { type: Type.STRING },
          techStack: { type: Type.ARRAY, items: { type: Type.STRING } },
          attackSurfaces: { type: Type.ARRAY, items: { type: Type.STRING } },
          highRiskFiles: { type: Type.ARRAY, items: { type: Type.STRING } },
          estimatedRiskScore: { type: Type.NUMBER }
        },
        required: ["projectOverview", "techStack", "attackSurfaces", "highRiskFiles", "estimatedRiskScore"]
      }
    }
  });

  return JSON.parse(result.text);
}

export async function auditFile(fileName: string, content: string): Promise<{ findings: SecurityFinding[], logs: { prover: string, skeptic: string } }> {
  const ai = getAI();
  
  // PHASE 1: THE PROVER (Identify vulnerabilities & AI Pitfalls)
  const proverPrompt = `You are an elite Security Auditor (The Prover). 
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

  const proverResult = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: proverPrompt,
  });

  // PHASE 2: THE SKEPTIC (Counter-Audit/Debunking)
  const skepticPrompt = `You are a Senior AppSec Defensive Engineer (The Skeptic).
  Review the following findings for file "${fileName}". 
  Your goal is to PROVE these findings are false positives, dead code, or harmless hallucinations.
  
  Findings:
  ${proverResult.text}
  
  Check for:
  - Framework Isolation: Is the "vulnerability" in a dead or unreachable file?
  - Dead Code: Is the orphaned variable actually security-relevant or just junk?
  - Mocked Security: If the Prover says sanitization is missing, verify if the framework does it automatically.
  
  Provide a rebuttal for each finding.`;

  const skepticResult = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: skepticPrompt,
  });

  // PHASE 3: THE JUDGE (Final Verdict)
  const judgePrompt = `You are the Lead Security Architect. You must reconcile the arguments from a Security Auditor (Prover) and a Defense Engineer (Skeptic).
  
  File: ${fileName}
  Prover Findings: ${proverResult.text}
  Skeptic Rebuttals: ${skepticResult.text}
  
  Your task:
  1. If the Skeptic successfully debunked a finding, discard it or lower confidence to < 0.2.
  2. If the Prover's finding stands even after rebuttal, keep it and set confidence > 0.8.
  3. Provide a final "Reasoning" explaining the consensus.
  
  Format as JSON only.`;

  const validated = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: judgePrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
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
            reasoning: { type: Type.STRING }
          },
          required: ["title", "severity", "description", "evidence", "file", "confidence", "reasoning"]
        }
      }
    }
  });

  return {
    findings: JSON.parse(validated.text),
    logs: {
      prover: proverResult.text,
      skeptic: skepticResult.text
    }
  };
}

export async function refactorCode(finding: SecurityFinding, content: string): Promise<{ 
  mitigation: string, 
  critique: string, 
  researchQueries: string[] 
}> {
  const ai = getAI();
  
  // PHASE 1: Generate the Initial Mitigation
  const mitigationPrompt = `You are a Senior Security Engineer. 
  Provide a secure refactor for the following vulnerability.
  
  Vulnerability: ${finding.title}
  AI Reasoning for Finding: ${finding.reasoning}
  
  Original Code:
  ${content}
  
  Focus on high-fidelity, production-ready code. Provide only the code in a markdown block.`;

  const mitigationResult = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: mitigationPrompt
  });
  const mitigationCode = mitigationResult.text;

  // PHASE 2: The Self-Critique (Finding the "Shaky/Stupid" Code)
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

  const critiqueResult = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: critiquePrompt
  });

  // PHASE 3: Independent Research Queries
  const researchPrompt = `Based on the vulnerability "${finding.title}" and the proposed fix, provide 3 specific research queries or topics the human developer should look up on OWASP, MDN, or GitHub to independently verify this solution.
  
  Format as a JSON array of strings only.`;

  const researchResult = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: researchPrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  return {
    mitigation: mitigationCode,
    critique: critiqueResult.text,
    researchQueries: JSON.parse(researchResult.text)
  };
}
