/**
 * OpenAI-compatible provider.
 *
 * Drives any OpenAI-compatible chat-completions API with the official `openai`
 * SDK (auto retry/backoff, timeouts, connection reuse). One class covers
 * DeepSeek, OpenAI, Groq, OpenRouter, Together, etc. — they differ only by
 * `baseURL` + `model`. The `name` label distinguishes them for observability.
 */

import OpenAI from "openai";
import { AIProvider, AIProviderName, AICredentials, GenerateOptions, AIGenerateResult } from "./types";

export class OpenAICompatibleProvider implements AIProvider {
  readonly name: AIProviderName;
  private client: OpenAI | null = null;

  constructor(private creds: AICredentials, name: AIProviderName = "openai") {
    this.name = name;
  }

  isConfigured(): boolean {
    return !!this.creds.apiKey;
  }

  private getClient(): OpenAI {
    if (!this.creds.apiKey) throw new Error(`${this.name} is not configured (missing API key)`);
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.creds.apiKey,
        ...(this.creds.baseURL ? { baseURL: this.creds.baseURL } : {}),
        maxRetries: 2,
        timeout: 60_000,
      });
    }
    return this.client;
  }

  async generateText(prompt: string, opts: GenerateOptions = {}): Promise<AIGenerateResult> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (opts.systemInstruction) {
      messages.push({ role: "system", content: opts.systemInstruction });
    }
    messages.push({ role: "user", content: prompt });

    // Built loosely so provider-specific params pass through the OpenAI types.
    const params: any = { model: this.creds.model, messages };
    if (opts.json) params.response_format = { type: "json_object" };
    if (opts.temperature != null) params.temperature = opts.temperature;
    if (opts.maxOutputTokens != null) params.max_tokens = opts.maxOutputTokens;

    const res = await this.getClient().chat.completions.create(params);
    return {
      text: res.choices?.[0]?.message?.content ?? "",
      usage: {
        promptTokens: res.usage?.prompt_tokens ?? 0,
        completionTokens: res.usage?.completion_tokens ?? 0,
      },
      model: this.creds.model,
    };
  }

  async listModels(): Promise<string[]> {
    const res = await this.getClient().models.list();
    return (res.data || []).map((m: any) => m.id).filter(Boolean);
  }
}
