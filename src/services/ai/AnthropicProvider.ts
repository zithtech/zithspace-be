/**
 * Anthropic (Claude) provider (@anthropic-ai/sdk).
 *
 * Runs with explicit {@link AICredentials} for tenant BYO configs. Anthropic
 * requires `max_tokens` on every request and has no JSON mode — callers that
 * need JSON already instruct the model to return it in the prompt.
 */

import Anthropic from "@anthropic-ai/sdk";
import { AIProvider, AICredentials, GenerateOptions, AIGenerateResult } from "./types";

const DEFAULT_MAX_TOKENS = 4096;

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const;
  private client: Anthropic | null = null;

  constructor(private creds: AICredentials) {}

  isConfigured(): boolean {
    return !!this.creds.apiKey;
  }

  private getClient(): Anthropic {
    if (!this.creds.apiKey) throw new Error("Anthropic is not configured (missing API key)");
    if (!this.client) {
      this.client = new Anthropic({
        apiKey: this.creds.apiKey,
        ...(this.creds.baseURL ? { baseURL: this.creds.baseURL } : {}),
        maxRetries: 2,
        timeout: 60_000,
      });
    }
    return this.client;
  }

  async generateText(prompt: string, opts: GenerateOptions = {}): Promise<AIGenerateResult> {
    const params: any = {
      model: this.creds.model,
      max_tokens: opts.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    };
    if (opts.systemInstruction) params.system = opts.systemInstruction;
    if (opts.temperature != null) params.temperature = opts.temperature;

    const res: any = await this.getClient().messages.create(params);
    const text = (res?.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
      
    return {
      text,
      usage: {
        promptTokens: res?.usage?.input_tokens ?? 0,
        completionTokens: res?.usage?.output_tokens ?? 0,
      },
      model: this.creds.model,
    };
  }

  async listModels(): Promise<string[]> {
    // models.list exists in recent SDK versions; guard for older ones.
    const client: any = this.getClient();
    if (typeof client.models?.list !== "function") return [];
    const res = await client.models.list();
    return (res?.data || []).map((m: any) => m.id).filter(Boolean);
  }
}
