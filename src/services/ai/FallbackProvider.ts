/**
 * Fallback wrapper.
 *
 * Tries `primary` (a tenant BYO provider); if it errors — invalid key, quota,
 * transport failure — it invokes `onPrimaryError` (to flag the failure on the
 * tenant's settings row) and transparently retries via `fallback` (ZAI). This
 * implements the "fall back to ZAI + flag it" policy without the AI services
 * needing to know a fallback happened.
 */

import { AIProvider, GenerateOptions } from "./types";

export class FallbackProvider implements AIProvider {
  readonly name: AIProvider["name"];

  constructor(
    private primary: AIProvider,
    private fallback: AIProvider,
    private onPrimaryError?: (err: any) => void | Promise<void>,
  ) {
    // Report the intended (primary) source; the flag captures the fallback.
    this.name = primary.name;
  }

  isConfigured(): boolean {
    return this.primary.isConfigured() || this.fallback.isConfigured();
  }

  async generateText(prompt: string, opts?: GenerateOptions): Promise<string> {
    try {
      return await this.primary.generateText(prompt, opts);
    } catch (err: any) {
      try {
        await this.onPrimaryError?.(err);
      } catch (flagErr) {
        console.error("[FallbackProvider] failed to flag primary error:", flagErr);
      }
      console.warn(
        `[FallbackProvider] primary "${this.primary.name}" failed (${err?.message}); falling back to "${this.fallback.name}"`,
      );
      return await this.fallback.generateText(prompt, opts);
    }
  }
}
