/**
 * Tenant-aware AI resolution.
 *
 * Resolution order for a given tenant:
 *   1. No tenantId / no active config      -> ZAI (platform default, env).
 *   2. mode = "platform"                   -> a predefined catalog model (our keys).
 *   3. mode = "byo"                        -> tenant's provider/model/key, wrapped
 *                                             in a FallbackProvider that flags the
 *                                             failure and falls back to ZAI.
 *
 * Settings are cached briefly (node-cache) so this isn't a DB hit per AI call;
 * the cache is invalidated whenever a tenant saves its config.
 */

import NodeCache from "node-cache";
import pool from "@/config/dbpool";
import { decryptSecure } from "@/utils/encryption";
import { AIProvider, AIProviderKind, AIProviderName, AICredentials } from "./types";
import {
  getAIProvider,
  buildProvider,
  geminiEnvCreds,
  deepseekEnvCreds,
} from "./index";
import { FallbackProvider } from "./FallbackProvider";

/** The predefined ZAI menu tenants can pick from in "platform" mode. */
export interface PlatformCatalogEntry {
  key: string;
  label: string;
  kind: AIProviderKind;
  name: AIProviderName;
  /** Platform credentials (our env keys), read fresh each build. */
  creds: () => AICredentials;
}

export const PLATFORM_CATALOG: PlatformCatalogEntry[] = [
  { key: "gemini-flash", label: "Gemini Flash (platform)", kind: "gemini", name: "gemini", creds: geminiEnvCreds },
  { key: "deepseek-v4pro", label: "DeepSeek V4 Pro (platform)", kind: "openai_compatible", name: "deepseek", creds: deepseekEnvCreds },
];

const KNOWN_KINDS: AIProviderKind[] = ["gemini", "openai_compatible", "anthropic"];

const settingsCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

/** Shape of a tenant_ai_settings row (raw pg). */
export interface TenantAiRow {
  id: string;
  tenant_id: string;
  mode: string;
  provider: string | null;
  model: string | null;
  api_key_encrypted: string | null;
  base_url: string | null;
  is_active: boolean;
  last_error: string | null;
  last_error_at: Date | null;
  last_used_mode: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

async function loadTenantSettings(tenantId: string): Promise<TenantAiRow | null> {
  const cached = settingsCache.get<TenantAiRow | null>(tenantId);
  if (cached !== undefined) return cached;
  const result = await pool.query(
    "SELECT * FROM tenant_ai_settings WHERE tenant_id = $1 LIMIT 1",
    [tenantId],
  );
  const row = (result.rows[0] ?? null) as TenantAiRow | null;
  settingsCache.set(tenantId, row);
  return row;
}

/** Drop a tenant's cached AI settings (call after a save). */
export function invalidateTenantAiCache(tenantId: string): void {
  settingsCache.del(tenantId);
}

/** Descriptive source label for a BYO provider kind. */
function byoName(kind: AIProviderKind): AIProviderName {
  if (kind === "gemini") return "gemini";
  if (kind === "anthropic") return "anthropic";
  return "openai";
}

/**
 * Resolve the AI provider for a tenant. Falls back to ZAI on any problem so an
 * AI feature never hard-breaks because of a bad tenant config.
 */
export async function getAIProviderForTenant(tenantId?: string): Promise<AIProvider> {
  if (!tenantId) return getAIProvider();

  let settings: TenantAiRow | null;
  try {
    settings = await loadTenantSettings(tenantId);
  } catch (err) {
    console.error("[ai/resolver] failed to load tenant settings:", err);
    return getAIProvider();
  }

  if (!settings || !settings.is_active) return getAIProvider();

  // --- platform mode: a predefined model on our keys -----------------------
  if (settings.mode === "platform") {
    const entry =
      PLATFORM_CATALOG.find((c) => c.key === settings!.model) ||
      PLATFORM_CATALOG.find((c) => c.name === settings!.provider);
    if (!entry) return getAIProvider();
    return buildProvider(entry.kind, entry.creds(), entry.name);
  }

  // --- byo mode: tenant's own provider/model/key ---------------------------
  const kind = settings.provider as AIProviderKind;
  if (!KNOWN_KINDS.includes(kind) || !settings.model || !settings.api_key_encrypted) {
    return getAIProvider();
  }

  let apiKey: string;
  try {
    apiKey = decryptSecure(settings.api_key_encrypted);
  } catch (err) {
    console.error("[ai/resolver] failed to decrypt tenant key:", err);
    return getAIProvider();
  }

  const creds: AICredentials = {
    apiKey,
    model: settings.model,
    baseURL: settings.base_url || undefined,
  };
  const primary = buildProvider(kind, creds, byoName(kind));
  const fallback = getAIProvider();

  // "Fall back to ZAI + flag it": record the failure on the tenant row.
  return new FallbackProvider(primary, fallback, (err) => flagTenantError(tenantId, err));
}

async function flagTenantError(tenantId: string, err: any): Promise<void> {
  try {
    await pool.query(
      `UPDATE tenant_ai_settings
         SET last_error = $1, last_error_at = NOW(), last_used_mode = 'platform-fallback', updated_at = NOW()
       WHERE tenant_id = $2`,
      [String(err?.message || err || "AI call failed").slice(0, 500), tenantId],
    );
  } catch (e) {
    console.error("[ai/resolver] failed to flag tenant AI error:", e);
  } finally {
    invalidateTenantAiCache(tenantId);
  }
}
