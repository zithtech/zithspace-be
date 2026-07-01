// src/modules/payroll/repositories/bankFile.repo.ts
// Raw-SQL data access for pay_bank_files.

import { TenantClient } from '../db/pool';
import { BankFileFormat, PaymentMode, PayBankFile } from '../types';

const COLS = `
  id, tenant_id, run_id, month, year, period_label, format, payment_mode,
  employee_count, total_amount, skipped_count, file_url, file_key, generated_by, generated_at
`;

function mapRow(r: any): PayBankFile {
  return {
    id: r.id, tenantId: r.tenant_id, runId: r.run_id, month: r.month, year: r.year, periodLabel: r.period_label,
    format: r.format as BankFileFormat, paymentMode: r.payment_mode as PaymentMode,
    employeeCount: r.employee_count, totalAmount: Number(r.total_amount), skippedCount: r.skipped_count,
    fileUrl: r.file_url, fileKey: r.file_key, generatedBy: r.generated_by, generatedAt: r.generated_at,
  };
}

export interface UpsertBankFileData {
  runId: string;
  month: number;
  year: number;
  periodLabel: string;
  format: BankFileFormat;
  paymentMode: PaymentMode;
  employeeCount: number;
  totalAmount: number;
  skippedCount: number;
  fileUrl: string;
  fileKey: string | null;
  generatedBy: string;
}

export async function upsertBankFile(client: TenantClient, d: UpsertBankFileData): Promise<PayBankFile> {
  const { rows } = await client.query(
    `INSERT INTO pay_bank_files
       (tenant_id, run_id, month, year, period_label, format, payment_mode, employee_count, total_amount, skipped_count, file_url, file_key, generated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (run_id) DO UPDATE SET
       format = EXCLUDED.format, payment_mode = EXCLUDED.payment_mode,
       employee_count = EXCLUDED.employee_count, total_amount = EXCLUDED.total_amount,
       skipped_count = EXCLUDED.skipped_count, file_url = EXCLUDED.file_url, file_key = EXCLUDED.file_key,
       generated_by = EXCLUDED.generated_by, generated_at = now()
     RETURNING ${COLS}`,
    [
      client.tenantId, d.runId, d.month, d.year, d.periodLabel, d.format, d.paymentMode,
      d.employeeCount, d.totalAmount, d.skippedCount, d.fileUrl, d.fileKey, d.generatedBy,
    ]
  );
  return mapRow(rows[0]);
}

export async function findByRun(client: TenantClient, runId: string): Promise<PayBankFile | null> {
  const { rows } = await client.query(`SELECT ${COLS} FROM pay_bank_files WHERE tenant_id = $1 AND run_id = $2`, [client.tenantId, runId]);
  return rows[0] ? mapRow(rows[0]) : null;
}
