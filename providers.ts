import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { GoogleGenAI } from "@google/genai";
import type { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

export type Provider = "claude" | "gemini";

/**
 * Skeptic is model-agnostic on purpose: the Prover-Skeptic-Judge method should
 * hold up regardless of which model plays each role, and comparing providers
 * is itself part of the eval story. Claude is preferred when both keys are
 * present because it's the primary target for the audit workload this tool
 * was built to prove out.
 */
export function resolveProvider(preferred?: Provider): Provider {
  if (preferred) return preferred;
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  if (process.env.GEMINI_API_KEY) return "gemini";
  throw new Error(
    "No AI provider configured. Set ANTHROPIC_API_KEY or GEMINI_API_KEY."
  );
}

let anthropicClient: Anthropic | null = null;
function getClaude(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
}

let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  }
  return geminiClient;
}

export const CLAUDE_MODEL = "claude-opus-5";
export const GEMINI_MODEL = "gemini-2.0-flash";

export async function generateText(
  prompt: string,
  provider: Provider
): Promise<string> {
  if (provider === "claude") {
    const res = await getClaude().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    });
    const block = res.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    return block?.text ?? "";
  }

  const res = await getGemini().models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
  });
  return res.text ?? "";
}

/**
 * Structured JSON generation. Claude uses `messages.parse()` with a Zod
 * schema (native structured outputs); Gemini uses its own `responseSchema`
 * format, which is a different shape from Zod/JSON Schema, so callers pass
 * both. Keeping them side by side here (rather than trying to auto-convert
 * one to the other) means each provider gets its documented native format
 * instead of a lossy translation layer.
 */
export async function generateJSON<T>(
  prompt: string,
  // z.ZodTypeAny (not z.ZodType<T>): the installed SDK's zod helper has its
  // own internal ZodType branding that doesn't structurally match a
  // project-level `ZodType<T>` generic, even on a compatible zod version.
  // T is supplied explicitly by the caller and asserted at the return below.
  zodSchema: z.ZodTypeAny,
  geminiSchema: unknown,
  provider: Provider
): Promise<T> {
  if (provider === "claude") {
    const res = await getClaude().messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
      output_config: {
        format: zodOutputFormat(zodSchema as unknown as Parameters<typeof zodOutputFormat>[0]),
      },
    });
    if (!res.parsed_output) {
      throw new Error("Claude structured output failed to parse");
    }
    return res.parsed_output as T;
  }

  const res = await getGemini().models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: geminiSchema as never,
    },
  });
  return JSON.parse(res.text ?? "{}") as T;
}
