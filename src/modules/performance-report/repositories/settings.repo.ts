// src/modules/performance-report/repositories/settings.repo.ts
//
// Raw-SQL data access for prr_settings and prr_module_settings. This layer ONLY
// builds parameterized queries and maps rows — no business rules, no HTTP.
//
// Every query takes a TenantClient (already scoped via withTenant) AND filters
// `tenant_id = $1` explicitly. RLS would enforce this anyway; the explicit
// filter is the second, independent guard against cross-tenant access.

import { TenantClient } from '../db/pool';
import { ModuleKey, ModuleSetting, PerfReportSettings } from '../types';

// ─── prr_settings ────────────────────────────────────────────────────────────
interface SettingsRow {
  id: string;
  tenant_id: string;
  auto_generate_enabled: boolean;
  generation_day: 'last_day';
  generation_time: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

const SETTINGS_COLS = `
  id, tenant_id, auto_generate_enabled, generation_day, generation_time,
  created_by, updated_by, created_at, updated_at
`;

function mapSettings(row: SettingsRow): PerfReportSettings {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    autoGenerateEnabled: row.auto_generate_enabled,
    generationDay: row.generation_day,
    generationTime: row.generation_time,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findSettings(client: TenantClient): Promise<PerfReportSettings | null> {
  const { rows } = await client.query<SettingsRow>(
    `SELECT ${SETTINGS_COLS} FROM prr_settings WHERE tenant_id = $1`,
    [client.tenantId]
  );
  return rows[0] ? mapSettings(rows[0]) : null;
}

export interface UpsertSettingsData {
  autoGenerateEnabled: boolean;
  generationDay: 'last_day';
  generationTime: string;
  actorId: string;
}

/**
 * Insert the tenant's settings row, or update it if one already exists
 * (one row per tenant, enforced by uq_prr_settings_tenant).
 */
export async function upsertSettings(
  client: TenantClient,
  data: UpsertSettingsData
): Promise<PerfReportSettings> {
  const { rows } = await client.query<SettingsRow>(
    `INSERT INTO prr_settings
       (tenant_id, auto_generate_enabled, generation_day, generation_time, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $5)
     ON CONFLICT (tenant_id) DO UPDATE SET
       auto_generate_enabled = EXCLUDED.auto_generate_enabled,
       generation_day        = EXCLUDED.generation_day,
       generation_time       = EXCLUDED.generation_time,
       updated_by            = EXCLUDED.updated_by,
       updated_at            = now()
     RETURNING ${SETTINGS_COLS}`,
    [
      client.tenantId,
      data.autoGenerateEnabled,
      data.generationDay,
      data.generationTime,
      data.actorId,
    ]
  );
  return mapSettings(rows[0]);
}

// ─── prr_module_settings ─────────────────────────────────────────────────────
interface ModuleRow {
  id: string;
  tenant_id: string;
  module_key: ModuleKey;
  is_enabled: boolean;
  weight: string; // numeric → string from pg
  config: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

const MODULE_COLS = `
  id, tenant_id, module_key, is_enabled, weight, config,
  created_by, updated_by, created_at, updated_at
`;

function mapModule(row: ModuleRow): ModuleSetting {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    moduleKey: row.module_key,
    isEnabled: row.is_enabled,
    weight: Number(row.weight),
    config: row.config ?? {},
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Distinct ticket statuses actually in use for this tenant (with usage counts).
 * Status is a free-text column — each tenant runs its own workflow — so this is
 * the only reliable source of "the status levels" to mark up in Settings.
 */
export async function findTicketStatuses(
  client: TenantClient
): Promise<Array<{ status: string; count: number }>> {
  const { rows } = await client.query(
    `SELECT status, COUNT(*)::int AS count
       FROM tickets
      WHERE tenant_id = $1
        AND is_deleted = false
        AND status IS NOT NULL
        AND status <> ''
      GROUP BY status
      ORDER BY COUNT(*) DESC, status ASC`,
    [client.tenantId]
  );
  return rows.map((r: any) => ({ status: r.status, count: r.count }));
}

export async function findModules(client: TenantClient): Promise<ModuleSetting[]> {
  const { rows } = await client.query<ModuleRow>(
    `SELECT ${MODULE_COLS} FROM prr_module_settings WHERE tenant_id = $1`,
    [client.tenantId]
  );
  return rows.map(mapModule);
}

export interface UpsertModuleData {
  moduleKey: ModuleKey;
  isEnabled: boolean;
  weight: number;
  config: Record<string, unknown>;
  actorId: string;
}

/**
 * Insert or update one module row, keyed by (tenant_id, module_key). Returns the
 * persisted row.
 */
export async function upsertModule(
  client: TenantClient,
  data: UpsertModuleData
): Promise<ModuleSetting> {
  const { rows } = await client.query<ModuleRow>(
    `INSERT INTO prr_module_settings
       (tenant_id, module_key, is_enabled, weight, config, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $6)
     ON CONFLICT (tenant_id, module_key) DO UPDATE SET
       is_enabled = EXCLUDED.is_enabled,
       weight     = EXCLUDED.weight,
       config     = EXCLUDED.config,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()
     RETURNING ${MODULE_COLS}`,
    [
      client.tenantId,
      data.moduleKey,
      data.isEnabled,
      data.weight,
      JSON.stringify(data.config ?? {}),
      data.actorId,
    ]
  );
  return mapModule(rows[0]);
}
