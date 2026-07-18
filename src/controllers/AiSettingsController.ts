/**
 * Tenant AI settings (ZAI predefined pick, or BYO provider/model/key).
 *
 * - GET  /api/ai/settings        → current config (key masked) + platform menu
 * - PUT  /api/ai/settings        → upsert config (validates, encrypts key)
 * - POST /api/ai/settings/test   → validate credentials + list available models
 *
 * The raw API key is never returned to the client. Keys are stored with
 * AES-256-GCM (see utils/encryption). Saving invalidates the resolver cache.
 */

import { Response } from "express";
import { AuthRequest } from "@/types";
import pool from "@/config/dbpool";
import { encryptSecure, decryptSecure } from "@/utils/encryption";
import {
  PLATFORM_CATALOG,
  invalidateTenantAiCache,
  TenantAiRow,
} from "@/services/ai/resolver";
import { buildProvider, AIProviderKind } from "@/services/ai";

const BYO_KINDS: AIProviderKind[] = ["gemini", "openai_compatible", "anthropic"];

/** Show only enough of a key to recognize it. */
function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 3)}••••${key.slice(-4)}`;
}

function platformMenu() {
  return PLATFORM_CATALOG.map((c) => ({ key: c.key, label: c.label, provider: c.name }));
}

async function getRow(tenantId: string): Promise<TenantAiRow | null> {
  const result = await pool.query(
    "SELECT * FROM tenant_ai_settings WHERE tenant_id = $1 LIMIT 1",
    [tenantId],
  );
  return (result.rows[0] ?? null) as TenantAiRow | null;
}

export class AiSettingsController {
  static async getSettings(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId!;
      const row = await getRow(tenantId);

      let apiKeyMasked: string | null = null;
      if (row?.api_key_encrypted) {
        try {
          apiKeyMasked = maskKey(decryptSecure(row.api_key_encrypted));
        } catch {
          apiKeyMasked = null; // corrupt/undecryptable — still report hasApiKey
        }
      }

      return res.json({
        success: true,
        settings: row
          ? {
              mode: row.mode,
              provider: row.provider,
              model: row.model,
              baseUrl: row.base_url,
              isActive: row.is_active,
              hasApiKey: !!row.api_key_encrypted,
              apiKeyMasked,
              lastError: row.last_error,
              lastErrorAt: row.last_error_at,
            }
          : null,
        platformCatalog: platformMenu(),
      });
    } catch (error: any) {
      console.error("[AiSettingsController.getSettings]", error);
      return res.status(500).json({ success: false, error: "Failed to load AI settings" });
    }
  }

  static async updateSettings(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const { mode, modelKey, provider, model, apiKey, baseUrl, isActive } = req.body || {};

      if (mode !== "platform" && mode !== "byo") {
        return res.status(400).json({ success: false, error: "mode must be 'platform' or 'byo'" });
      }

      const existing = await getRow(tenantId);

      // Resolve the column values per mode.
      let providerVal: string | null;
      let modelVal: string | null;
      let apiKeyEncrypted: string | null = null;
      let baseUrlVal: string | null = null;

      if (mode === "platform") {
        const entry = PLATFORM_CATALOG.find((c) => c.key === modelKey);
        if (!entry) {
          return res.status(400).json({ success: false, error: "Unknown platform model" });
        }
        providerVal = entry.name;
        modelVal = entry.key;
      } else {
        // byo
        if (!BYO_KINDS.includes(provider)) {
          return res.status(400).json({ success: false, error: "Unsupported provider" });
        }
        if (!model || typeof model !== "string") {
          return res.status(400).json({ success: false, error: "model is required" });
        }
        const hasExistingKey = !!existing?.api_key_encrypted;
        if (!apiKey && !hasExistingKey) {
          return res.status(400).json({ success: false, error: "apiKey is required" });
        }
        providerVal = provider;
        modelVal = model;
        baseUrlVal = baseUrl || null;
        // Encrypt a new key, otherwise keep the existing one.
        apiKeyEncrypted = apiKey ? encryptSecure(String(apiKey)) : existing?.api_key_encrypted ?? null;
      }

      const active = isActive === undefined ? true : !!isActive;

      const upsert = await pool.query(
        `INSERT INTO tenant_ai_settings
           (tenant_id, mode, provider, model, api_key_encrypted, base_url, is_active, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
         ON CONFLICT (tenant_id) DO UPDATE SET
           mode = EXCLUDED.mode,
           provider = EXCLUDED.provider,
           model = EXCLUDED.model,
           api_key_encrypted = EXCLUDED.api_key_encrypted,
           base_url = EXCLUDED.base_url,
           is_active = EXCLUDED.is_active,
           last_error = NULL,
           last_error_at = NULL,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
         RETURNING *`,
        [tenantId, mode, providerVal, modelVal, apiKeyEncrypted, baseUrlVal, active, userId],
      );

      const saved = upsert.rows[0] as TenantAiRow;
      invalidateTenantAiCache(tenantId);

      return res.json({
        success: true,
        settings: {
          mode: saved.mode,
          provider: saved.provider,
          model: saved.model,
          baseUrl: saved.base_url,
          isActive: saved.is_active,
          hasApiKey: !!saved.api_key_encrypted,
        },
      });
    } catch (error: any) {
      console.error("[AiSettingsController.updateSettings]", error);
      return res.status(500).json({ success: false, error: "Failed to save AI settings" });
    }
  }

  /**
   * Validate a provider credential and return the models it can access, so the
   * UI can populate its model dropdown. Uses the key from the body, or the
   * already-saved key when the body omits it (re-test).
   */
  static async testConnection(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId!;
      const { provider, apiKey, baseUrl, model } = req.body || {};

      if (!BYO_KINDS.includes(provider)) {
        return res.status(400).json({ success: false, error: "Unsupported provider" });
      }

      let key = apiKey ? String(apiKey) : "";
      if (!key) {
        const existing = await getRow(tenantId);
        if (existing?.api_key_encrypted) {
          try {
            key = decryptSecure(existing.api_key_encrypted);
          } catch {
            /* fall through to the missing-key error */
          }
        }
      }
      if (!key) {
        return res.status(400).json({ success: false, error: "apiKey is required to test" });
      }

      const providerInstance = buildProvider(
        provider as AIProviderKind,
        { apiKey: key, model: model || "test", baseURL: baseUrl || undefined },
        provider === "openai_compatible" ? "openai" : (provider as any),
      );

      if (typeof providerInstance.listModels !== "function") {
        return res.json({ success: true, models: [], note: "Provider does not support listing models" });
      }

      const models = await providerInstance.listModels();
      return res.json({ success: true, models });
    } catch (error: any) {
      console.error("[AiSettingsController.testConnection]", error?.message || error);
      return res.status(400).json({
        success: false,
        error: "Connection test failed — check the API key / base URL",
        detail: String(error?.message || error).slice(0, 300),
      });
    }
  }
}
