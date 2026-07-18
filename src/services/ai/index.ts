/**
 * AI provider factory + ZAI (platform) switch.
 *
 * `getAIProvider()` returns the platform provider selected by the `AI_PROVIDER`
 * env var (`gemini` | `deepseek`), keyed by our env credentials. It is the
 * default and the fallback for the tenant-aware resolver (see resolver.ts).
 *
 * `buildProvider()` is the shared constructor used by both the ZAI catalog and
 * tenant BYO configs — given a kind + credentials, it returns the right class.
 */

import {
  AIProvider,
  AIProviderName,
  AIProviderKind,
  AICredentials,
} from "./types";
import { GeminiProvider } from "./GeminiProvider";
import { OpenAICompatibleProvider } from "./OpenAICompatibleProvider";
import { AnthropicProvider } from "./AnthropicProvider";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro";

/** Platform (ZAI) credentials, read from env. */
export function geminiEnvCreds(): AICredentials {
  return {
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "",
    model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
  };
}
export function deepseekEnvCreds(): AICredentials {
  return {
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    model: process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
    baseURL: process.env.DEEPSEEK_BASE_URL || DEEPSEEK_BASE_URL,
  };
}

/**
 * Construct a provider from an implementation kind + credentials.
 * `name` is the descriptive source label (defaults sensibly per kind).
 */
export function buildProvider(
  kind: AIProviderKind,
  creds: AICredentials,
  name?: AIProviderName,
): AIProvider {
  switch (kind) {
    case "gemini":
      return new GeminiProvider(creds);
    case "anthropic":
      return new AnthropicProvider(creds);
    case "openai_compatible":
    default:
      return new OpenAICompatibleProvider(creds, name || "openai");
  }
}

/** Normalize an override / env value to a known ZAI provider name. */
export function resolveProviderName(override?: string): "gemini" | "deepseek" {
  const raw = (override || process.env.AI_PROVIDER || "gemini").trim().toLowerCase();
  return raw === "deepseek" ? "deepseek" : "gemini";
}

// Cache platform providers per name so the underlying SDK client (and its HTTP
// connection pool) is reused across requests.
const zaiCache = new Map<string, AIProvider>();

/** The platform (ZAI) provider selected by env. Also the fallback for BYO. */
export function getAIProvider(override?: string): AIProvider {
  const name = resolveProviderName(override);
  let provider = zaiCache.get(name);
  if (!provider) {
    provider =
      name === "deepseek"
        ? new OpenAICompatibleProvider(deepseekEnvCreds(), "deepseek")
        : new GeminiProvider(geminiEnvCreds());
    zaiCache.set(name, provider);
  }
  return provider;
}

/** Clear the ZAI provider cache (e.g. after an env/model change in dev). */
export function clearAIProviderCache(): void {
  zaiCache.clear();
}

export * from "./types";
