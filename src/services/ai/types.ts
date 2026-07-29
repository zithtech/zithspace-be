/**
 * Provider-agnostic AI abstraction.
 *
 * Two tiers sit on top of this interface (see resolver.ts):
 *   - ZAI      — the platform's own providers, keyed by our env credentials.
 *   - BYO      — a tenant's own provider/model/key.
 *
 * The surface is deliberately tiny — every existing call reduces to
 * `prompt -> text`. Structured-output/JSON handling stays in the callers.
 */

/** Descriptive source label, surfaced to callers as the response `source`. */
export type AIProviderName = "gemini" | "deepseek" | "openai" | "anthropic";

/** Implementation class kind — which SDK backs a provider. */
export type AIProviderKind = "gemini" | "openai_compatible" | "anthropic";

/** Concrete credentials a provider instance runs with. */
export interface AICredentials {
  apiKey: string;
  model: string;
  /** Base URL override — used by OpenAI-compatible providers (DeepSeek, Groq…). */
  baseURL?: string;
}

export interface GenerateOptions {
  /**
   * System-level instruction / persona.
   * Gemini: `systemInstruction`. OpenAI-compatible: leading `system` message.
   * Anthropic: top-level `system`.
   */
  systemInstruction?: string;
  /**
   * Ask the model to emit strict JSON.
   * Gemini: `responseMimeType: "application/json"`.
   * OpenAI-compatible: `response_format: { type: "json_object" }`.
   * Anthropic has no JSON mode — the prompt must instruct it (callers already do).
   */
  json?: boolean;
  /** Sampling temperature. Omit to use the provider default. */
  temperature?: number;
  /** Max output tokens. Omit to use the provider default. */
  maxOutputTokens?: number;
  /**
   * Gemini-only: disable the safety filters (BLOCK_NONE across categories).
   * Ignored by providers that have no equivalent.
   */
  disableSafety?: boolean;
}

export interface AIProvider {
  /** Descriptive identifier, surfaced to callers as the response `source`. */
  readonly name: AIProviderName;
  /** True when the provider has the credentials it needs to run. */
  isConfigured(): boolean;
  /** Single-turn generation. Returns the raw text; throws on failure. */
  generateText(prompt: string, opts?: GenerateOptions): Promise<string>;
  /** List model ids available to these credentials (for the settings UI). */
  listModels?(): Promise<string[]>;
}
