import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest } from "@/types";

/**
 * The set of client-portal pages whose visibility can be toggled per client.
 * `key` matches the portal route slug (and the FE nav href segment) so the
 * same value drives the admin toggle, the /auth/me payload, and the
 * server-side gate. The portal "Home" dashboard is intentionally excluded —
 * it is always visible.
 */
export const PORTAL_MODULES: { key: string; label: string }[] = [
  { key: "invoices", label: "Invoices" },
  { key: "mom", label: "Meetings" },
  { key: "documents", label: "Documents" },
  { key: "sprints", label: "Sprints" },
  { key: "milestones", label: "Milestones" },
  { key: "change-requests", label: "Change Requests" },
  { key: "approvals", label: "Approvals" },
  { key: "tickets", label: "Support" },
  { key: "releases", label: "Releases" },
  { key: "environments", label: "Environments" },
  { key: "team", label: "Team" },
];

const MODULE_KEYS = new Set(PORTAL_MODULES.map((m) => m.key));

/**
 * Returns the map of module_key -> enabled for a client. Opt-out model:
 * any module without a stored row defaults to enabled (true).
 */
async function getModuleMap(
  tenantId: string,
  clientId: string,
): Promise<Record<string, boolean>> {
  const rows = await pool.query(
    `SELECT module_key, enabled
       FROM client_portal_module_settings
      WHERE tenant_id = $1 AND client_id = $2`,
    [tenantId, clientId],
  );
  const stored = new Map<string, boolean>(
    rows.rows.map((r) => [r.module_key as string, !!r.enabled]),
  );
  const map: Record<string, boolean> = {};
  for (const m of PORTAL_MODULES) {
    map[m.key] = stored.has(m.key) ? (stored.get(m.key) as boolean) : true;
  }
  return map;
}

/**
 * Returns the list of enabled module keys for a client (used by the portal
 * to filter its navigation). Consumed by /auth/me.
 */
export async function getEnabledModuleKeys(
  tenantId: string,
  clientId: string,
): Promise<string[]> {
  const map = await getModuleMap(tenantId, clientId);
  return PORTAL_MODULES.filter((m) => map[m.key]).map((m) => m.key);
}

/**
 * True when a given module is enabled for a client. Used by the portal gate
 * middleware. Fail-open: unknown keys and missing rows resolve to enabled.
 */
export async function isModuleEnabled(
  tenantId: string,
  clientId: string,
  moduleKey: string,
): Promise<boolean> {
  if (!MODULE_KEYS.has(moduleKey)) return true;
  const r = await pool.query(
    `SELECT enabled
       FROM client_portal_module_settings
      WHERE tenant_id = $1 AND client_id = $2 AND module_key = $3
      LIMIT 1`,
    [tenantId, clientId, moduleKey],
  );
  if (r.rowCount === 0) return true; // opt-out default
  return !!r.rows[0].enabled;
}

export class ClientPortalModuleSettingsController {
  /**
   * GET /api/clients-v2/:clientId/portal-modules
   * Returns the full catalog with each module's effective enabled state.
   */
  static async list(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { clientId } = req.params;
    const map = await getModuleMap(tenantId, clientId);
    res.json({
      success: true,
      data: PORTAL_MODULES.map((m) => ({
        key: m.key,
        label: m.label,
        enabled: map[m.key],
      })),
    });
  }

  /**
   * PUT /api/clients-v2/:clientId/portal-modules
   * body: { modules: { [key]: boolean } }  — partial maps are allowed.
   * Upserts a row per provided module. Unknown keys are ignored.
   */
  static async update(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user?.id || null;
    const { clientId } = req.params;
    const modules = req.body?.modules;

    if (!modules || typeof modules !== "object" || Array.isArray(modules)) {
      res
        .status(400)
        .json({ success: false, error: "modules object is required" });
      return;
    }

    const entries = Object.entries(modules).filter(([key]) =>
      MODULE_KEYS.has(key),
    );
    if (entries.length === 0) {
      res
        .status(400)
        .json({ success: false, error: "No valid module keys provided" });
      return;
    }

    for (const [key, value] of entries) {
      await pool.query(
        `INSERT INTO client_portal_module_settings
           (tenant_id, client_id, module_key, enabled, updated_by_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, client_id, module_key)
         DO UPDATE SET enabled = EXCLUDED.enabled,
                       updated_by_id = EXCLUDED.updated_by_id,
                       updated_at = NOW()`,
        [tenantId, clientId, key, !!value, userId],
      );
    }

    const map = await getModuleMap(tenantId, clientId);
    res.json({
      success: true,
      data: PORTAL_MODULES.map((m) => ({
        key: m.key,
        label: m.label,
        enabled: map[m.key],
      })),
    });
  }
}

export default ClientPortalModuleSettingsController;
