// src/modules/payroll/repositories/profile.repo.ts
//
// Raw-SQL data access for pay_employee_profiles (one row per employee).
// Every query takes a tenant-scoped client AND filters tenant_id explicitly.

import { TenantClient } from '../db/pool';
import { EmployeeProfile, TaxRegime } from '../types';

const COLS = `
  id, tenant_id, employee_id, pan, uan, pf_number, esi_number, tax_regime,
  account_holder_name, bank_name, bank_account_number, bank_ifsc,
  created_by, updated_by, created_at, updated_at
`;

function mapRow(r: any): EmployeeProfile {
  return {
    id: r.id, tenantId: r.tenant_id, employeeId: r.employee_id,
    pan: r.pan, uan: r.uan, pfNumber: r.pf_number, esiNumber: r.esi_number, taxRegime: r.tax_regime,
    accountHolderName: r.account_holder_name, bankName: r.bank_name,
    bankAccountNumber: r.bank_account_number, bankIfsc: r.bank_ifsc,
    createdBy: r.created_by, updatedBy: r.updated_by, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export async function findByEmployee(client: TenantClient, employeeId: string): Promise<EmployeeProfile | null> {
  const { rows } = await client.query(
    `SELECT ${COLS} FROM pay_employee_profiles WHERE tenant_id = $1 AND employee_id = $2`,
    [client.tenantId, employeeId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listAll(client: TenantClient): Promise<EmployeeProfile[]> {
  const { rows } = await client.query(`SELECT ${COLS} FROM pay_employee_profiles WHERE tenant_id = $1`, [client.tenantId]);
  return rows.map(mapRow);
}

export interface UpsertProfileData {
  pan: string | null;
  uan: string | null;
  pfNumber: string | null;
  esiNumber: string | null;
  taxRegime: TaxRegime;
  accountHolderName: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  actorId: string;
}

export async function upsert(client: TenantClient, employeeId: string, d: UpsertProfileData): Promise<EmployeeProfile> {
  const { rows } = await client.query(
    `INSERT INTO pay_employee_profiles
       (tenant_id, employee_id, pan, uan, pf_number, esi_number, tax_regime,
        account_holder_name, bank_name, bank_account_number, bank_ifsc, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
     ON CONFLICT (tenant_id, employee_id) DO UPDATE SET
       pan = EXCLUDED.pan, uan = EXCLUDED.uan, pf_number = EXCLUDED.pf_number,
       esi_number = EXCLUDED.esi_number, tax_regime = EXCLUDED.tax_regime,
       account_holder_name = EXCLUDED.account_holder_name, bank_name = EXCLUDED.bank_name,
       bank_account_number = EXCLUDED.bank_account_number, bank_ifsc = EXCLUDED.bank_ifsc,
       updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING ${COLS}`,
    [
      client.tenantId, employeeId, d.pan, d.uan, d.pfNumber, d.esiNumber, d.taxRegime,
      d.accountHolderName, d.bankName, d.bankAccountNumber, d.bankIfsc, d.actorId,
    ]
  );
  return mapRow(rows[0]);
}
