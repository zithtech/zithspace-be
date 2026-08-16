/**
 * Google Gemini provider (@google/generative-ai).
 *
 * Runs with explicit {@link AICredentials} so it can back either ZAI (env key)
 * or a tenant BYO config (their key). Includes the retry-on-429/503 +
 * quota-detection logic that Gemini needs.
 */

import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import axios from "axios";
import { AIProvider, AICredentials, GenerateOptions, AIGenerateResult } from "./types";

/** Hard ceiling on retry sleep — quota errors can suggest hours/days. */
const MAX_RETRY_DELAY_MS = 15_000;

/**
 * Extract the suggested retry delay (ms) from a Gemini SDK error.
 * Gemini surfaces it as `retryDelay: "4s"` inside RetryInfo on 429s; default 4s.
 * Capped so a "retry after 21h" quota response doesn't hang the request.
 */
function parseRetryDelayMs(err: any, fallbackMs = 4000): number {
  const msg = String(err?.message || "");
  const match = msg.match(/retryDelay["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)\s*s/i);
  const raw = match ? Math.ceil(parseFloat(match[1]) * 1000) : fallbackMs;
  return Math.min(raw, MAX_RETRY_DELAY_MS);
}

/** Quota-exhausted errors should NOT be retried — the window is hours away. */
function isQuotaExhaustedError(err: any): boolean {
  const msg = String(err?.message || "").toLowerCase();
  return (
    /quota.*exceeded/.test(msg) ||
    /exceeded.*quota/.test(msg) ||
    /resource.?exhausted/.test(msg) ||
    /generate_content_free_tier/.test(msg) ||
    /per[\s_-]*day/.test(msg)
  );
}

function isRetriableError(err: any): boolean {
  if (isQuotaExhaustedError(err)) return false;
  const msg = String(err?.message || "");
  return /\b(429|503)\b/.test(msg) || /rate.?limit|overloaded|unavailable/i.test(msg);
}

const NO_SAFETY = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;
  private client: GoogleGenerativeAI | null = null;

  constructor(private creds: AICredentials) {}

  isConfigured(): boolean {
    return !!this.creds.apiKey;
  }

  private getClient(): GoogleGenerativeAI {
    if (!this.creds.apiKey) throw new Error("Gemini is not configured (missing API key)");
    if (!this.client) this.client = new GoogleGenerativeAI(this.creds.apiKey);
    return this.client;
  }

  async generateText(prompt: string, opts: GenerateOptions = {}): Promise<AIGenerateResult> {
    const model = this.getClient().getGenerativeModel({
      model: this.creds.model,
      ...(opts.systemInstruction ? { systemInstruction: opts.systemInstruction } : {}),
      ...(opts.disableSafety ? { safetySettings: NO_SAFETY } : {}),
      generationConfig: {
        ...(opts.json ? { responseMimeType: "application/json" } : {}),
        ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
        ...(opts.maxOutputTokens != null ? { maxOutputTokens: opts.maxOutputTokens } : {}),
      },
    });

    const result = await this.generateWithRetry(model, prompt);
    const usageMetadata = result.response.usageMetadata || { promptTokenCount: 0, candidatesTokenCount: 0 };
    return {
      text: result.response.text() ?? "",
      usage: {
        promptTokens: usageMetadata.promptTokenCount || 0,
        completionTokens: usageMetadata.candidatesTokenCount || 0,
      },
      model: this.creds.model,
    };
  }

  /** Gemini has no listModels in the SDK — hit the REST endpoint. */
  async listModels(): Promise<string[]> {
    if (!this.creds.apiKey) return [];
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
      this.creds.apiKey,
    )}`;
    const { data } = await axios.get(url, { timeout: 15_000 });
    return (data?.models || [])
      .filter((m: any) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m: any) => String(m.name || "").replace(/^models\//, ""))
      .filter(Boolean);
  }

  private async generateWithRetry(
    model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
    prompt: string,
    retries = 2,
  ): Promise<Awaited<ReturnType<typeof model.generateContent>>> {
    try {
      return await model.generateContent(prompt);
    } catch (err: any) {
      if (isQuotaExhaustedError(err)) {
        console.warn("[GeminiProvider] quota exhausted — skipping retries");
        throw err;
      }
      if (retries > 0 && isRetriableError(err)) {
        const delayMs = parseRetryDelayMs(err);
        console.warn(`[GeminiProvider] retriable error — retrying in ${delayMs}ms (${retries} left)`);
        await new Promise((r) => setTimeout(r, delayMs));
        return this.generateWithRetry(model, prompt, retries - 1);
      }
      throw err;
    }
  }
}
