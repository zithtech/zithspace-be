// src/modules/payroll/repositories/settings.repo.ts
//
// Raw-SQL data access for pay_settings. This layer ONLY builds parameterized
// queries and maps rows — no business rules, no HTTP.
//
// Every query takes a TenantClient (already scoped via withTenant) AND filters
// `tenant_id = $1` explicitly. RLS would enforce this anyway; the explicit
// filter is the second, independent guard against cross-tenant access.

import { TenantClient } from '../db/pool';
import { PayrollSettings } from '../types';

interface SettingsRow {
  id: string;
  tenant_id: string;
  financial_year_start_month: number;
  currency: string;
  pay_frequency: PayrollSettings['payFrequency'];
  salary_calc_basis: PayrollSettings['salaryCalcBasis'];
  salary_fixed_days: number;
  lop_calc_basis: PayrollSettings['lopCalcBasis'];
  lop_fixed_days: number;
  rounding_mode: PayrollSettings['roundingMode'];
  rounding_nearest: string; // numeric → string from pg
  decimal_places: number;
  pay_day: number;
  enable_lop: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

const SETTINGS_COLS = `
  id, tenant_id, financial_year_start_month, currency, pay_frequency,
  salary_calc_basis, salary_fixed_days, lop_calc_basis, lop_fixed_days,
  rounding_mode, rounding_nearest, decimal_places, pay_day, enable_lop,
  created_by, updated_by, created_at, updated_at
`;

function mapSettings(row: SettingsRow): PayrollSettings {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    financialYearStartMonth: row.financial_year_start_month,
    currency: row.currency,
    payFrequency: row.pay_frequency,
    salaryCalcBasis: row.salary_calc_basis,
    salaryFixedDays: row.salary_fixed_days,
    lopCalcBasis: row.lop_calc_basis,
    lopFixedDays: row.lop_fixed_days,
    roundingMode: row.rounding_mode,
    roundingNearest: Number(row.rounding_nearest),
    decimalPlaces: row.decimal_places,
    payDay: row.pay_day,
    enableLop: row.enable_lop,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findSettings(client: TenantClient): Promise<PayrollSettings | null> {
  const { rows } = await client.query<SettingsRow>(
    `SELECT ${SETTINGS_COLS} FROM pay_settings WHERE tenant_id = $1`,
    [client.tenantId]
  );
  return rows[0] ? mapSettings(rows[0]) : null;
}

export interface UpsertSettingsData {
  financialYearStartMonth: number;
  currency: string;
  payFrequency: PayrollSettings['payFrequency'];
  salaryCalcBasis: PayrollSettings['salaryCalcBasis'];
  salaryFixedDays: number;
  lopCalcBasis: PayrollSettings['lopCalcBasis'];
  lopFixedDays: number;
  roundingMode: PayrollSettings['roundingMode'];
  roundingNearest: number;
  decimalPlaces: number;
  payDay: number;
  enableLop: boolean;
  actorId: string;
}

/**
 * Insert the tenant's settings row, or update it if one already exists
 * (one row per tenant, enforced by uq_pay_settings_tenant).
 */
export async function upsertSettings(
  client: TenantClient,
  data: UpsertSettingsData
): Promise<PayrollSettings> {
  const { rows } = await client.query<SettingsRow>(
    `INSERT INTO pay_settings
       (tenant_id, financial_year_start_month, currency, pay_frequency,
        salary_calc_basis, salary_fixed_days, lop_calc_basis, lop_fixed_days,
        rounding_mode, rounding_nearest, decimal_places, pay_day, enable_lop,
        created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
     ON CONFLICT (tenant_id) DO UPDATE SET
       financial_year_start_month = EXCLUDED.financial_year_start_month,
       currency                   = EXCLUDED.currency,
       pay_frequency              = EXCLUDED.pay_frequency,
       salary_calc_basis          = EXCLUDED.salary_calc_basis,
       salary_fixed_days          = EXCLUDED.salary_fixed_days,
       lop_calc_basis             = EXCLUDED.lop_calc_basis,
       lop_fixed_days             = EXCLUDED.lop_fixed_days,
       rounding_mode              = EXCLUDED.rounding_mode,
       rounding_nearest           = EXCLUDED.rounding_nearest,
       decimal_places             = EXCLUDED.decimal_places,
       pay_day                    = EXCLUDED.pay_day,
       enable_lop                 = EXCLUDED.enable_lop,
       updated_by                 = EXCLUDED.updated_by,
       updated_at                 = now()
     RETURNING ${SETTINGS_COLS}`,
    [
      client.tenantId,
      data.financialYearStartMonth,
      data.currency,
      data.payFrequency,
      data.salaryCalcBasis,
      data.salaryFixedDays,
      data.lopCalcBasis,
      data.lopFixedDays,
      data.roundingMode,
      data.roundingNearest,
      data.decimalPlaces,
      data.payDay,
      data.enableLop,
      data.actorId,
    ]
  );
  return mapSettings(rows[0]);
}
