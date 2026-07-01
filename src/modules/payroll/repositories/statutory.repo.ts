// src/modules/payroll/repositories/statutory.repo.ts
//
// Raw-SQL data access for pay_pf_config and pay_esi_config (one row per tenant
// each). Every query takes a tenant-scoped client AND filters tenant_id.

import { TenantClient } from '../db/pool';
import { EsiConfig, PfConfig } from '../types';

// ── PF ───────────────────────────────────────────────────────────────────────
const PF_COLS = `
  id, tenant_id, enabled, employee_rate, employer_rate, wage_ceiling,
  restrict_to_ceiling, include_employer_in_ctc, eps_enabled, eps_rate,
  edli_enabled, edli_rate, admin_charges_rate, establishment_code,
  created_by, updated_by, created_at, updated_at
`;

function mapPf(r: any): PfConfig {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    enabled: r.enabled,
    employeeRate: Number(r.employee_rate),
    employerRate: Number(r.employer_rate),
    wageCeiling: Number(r.wage_ceiling),
    restrictToCeiling: r.restrict_to_ceiling,
    includeEmployerInCtc: r.include_employer_in_ctc,
    epsEnabled: r.eps_enabled,
    epsRate: Number(r.eps_rate),
    edliEnabled: r.edli_enabled,
    edliRate: Number(r.edli_rate),
    adminChargesRate: Number(r.admin_charges_rate),
    establishmentCode: r.establishment_code,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function findPf(client: TenantClient): Promise<PfConfig | null> {
  const { rows } = await client.query(`SELECT ${PF_COLS} FROM pay_pf_config WHERE tenant_id = $1`, [client.tenantId]);
  return rows[0] ? mapPf(rows[0]) : null;
}

export interface UpsertPfData {
  enabled: boolean;
  employeeRate: number;
  employerRate: number;
  wageCeiling: number;
  restrictToCeiling: boolean;
  includeEmployerInCtc: boolean;
  epsEnabled: boolean;
  epsRate: number;
  edliEnabled: boolean;
  edliRate: number;
  adminChargesRate: number;
  establishmentCode: string | null;
  actorId: string;
}

export async function upsertPf(client: TenantClient, d: UpsertPfData): Promise<PfConfig> {
  const { rows } = await client.query(
    `INSERT INTO pay_pf_config
       (tenant_id, enabled, employee_rate, employer_rate, wage_ceiling, restrict_to_ceiling,
        include_employer_in_ctc, eps_enabled, eps_rate, edli_enabled, edli_rate,
        admin_charges_rate, establishment_code, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
     ON CONFLICT (tenant_id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       employee_rate = EXCLUDED.employee_rate,
       employer_rate = EXCLUDED.employer_rate,
       wage_ceiling = EXCLUDED.wage_ceiling,
       restrict_to_ceiling = EXCLUDED.restrict_to_ceiling,
       include_employer_in_ctc = EXCLUDED.include_employer_in_ctc,
       eps_enabled = EXCLUDED.eps_enabled,
       eps_rate = EXCLUDED.eps_rate,
       edli_enabled = EXCLUDED.edli_enabled,
       edli_rate = EXCLUDED.edli_rate,
       admin_charges_rate = EXCLUDED.admin_charges_rate,
       establishment_code = EXCLUDED.establishment_code,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()
     RETURNING ${PF_COLS}`,
    [
      client.tenantId, d.enabled, d.employeeRate, d.employerRate, d.wageCeiling, d.restrictToCeiling,
      d.includeEmployerInCtc, d.epsEnabled, d.epsRate, d.edliEnabled, d.edliRate,
      d.adminChargesRate, d.establishmentCode, d.actorId,
    ]
  );
  return mapPf(rows[0]);
}

// ── ESI ──────────────────────────────────────────────────────────────────────
const ESI_COLS = `
  id, tenant_id, enabled, employee_rate, employer_rate, wage_threshold,
  establishment_code, created_by, updated_by, created_at, updated_at
`;

function mapEsi(r: any): EsiConfig {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    enabled: r.enabled,
    employeeRate: Number(r.employee_rate),
    employerRate: Number(r.employer_rate),
    wageThreshold: Number(r.wage_threshold),
    establishmentCode: r.establishment_code,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function findEsi(client: TenantClient): Promise<EsiConfig | null> {
  const { rows } = await client.query(`SELECT ${ESI_COLS} FROM pay_esi_config WHERE tenant_id = $1`, [client.tenantId]);
  return rows[0] ? mapEsi(rows[0]) : null;
}

export interface UpsertEsiData {
  enabled: boolean;
  employeeRate: number;
  employerRate: number;
  wageThreshold: number;
  establishmentCode: string | null;
  actorId: string;
}

export async function upsertEsi(client: TenantClient, d: UpsertEsiData): Promise<EsiConfig> {
  const { rows } = await client.query(
    `INSERT INTO pay_esi_config
       (tenant_id, enabled, employee_rate, employer_rate, wage_threshold, establishment_code, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
     ON CONFLICT (tenant_id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       employee_rate = EXCLUDED.employee_rate,
       employer_rate = EXCLUDED.employer_rate,
       wage_threshold = EXCLUDED.wage_threshold,
       establishment_code = EXCLUDED.establishment_code,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()
     RETURNING ${ESI_COLS}`,
    [client.tenantId, d.enabled, d.employeeRate, d.employerRate, d.wageThreshold, d.establishmentCode, d.actorId]
  );
  return mapEsi(rows[0]);
}
