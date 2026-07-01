// src/modules/payroll/services/bankFile.service.ts
//
// Generates a bank disbursement CSV for a finalized/paid run: net pay per
// employee with their beneficiary account, in the tenant's configured bank
// format. Uploaded to R2 (reusing the shared s3Client); only metadata persisted.

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';
import { s3Client, BUCKET_NAME } from '@/utils/r2Client';
import { withTenant } from '../db/pool';
import * as repo from '../repositories/bankFile.repo';
import * as runRepo from '../repositories/payRun.repo';
import * as profileRepo from '../repositories/profile.repo';
import * as payslipRepo from '../repositories/payslip.repo';
import * as payslipBankRepo from '../repositories/payslipBank.repo';
import { buildBankCsv, BankRow } from './bankFileCsv';
import { Actor, PayBankFile, PayrollError } from '../types';

const PUBLIC_URL = process.env.CF_R2_PUBLIC_URL;
function publicBase(): string {
  return (PUBLIC_URL && !PUBLIC_URL.includes('r2.cloudflarestorage.com')
    ? PUBLIC_URL
    : 'https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev'
  ).replace(/\/$/, '');
}
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function generateForRun(actor: Actor, runId: string): Promise<PayBankFile> {
  // ── Read phase ──────────────────────────────────────────────────────────────
  const ctx = await withTenant(actor.tenantId, async (client) => {
    const run = await runRepo.findRunById(client, runId);
    if (!run) throw PayrollError.notFound('Pay run');
    if (run.status !== 'finalized' && run.status !== 'paid') {
      throw PayrollError.badRequest('Finalize the run before generating the bank file');
    }
    const items = await runRepo.findItems(client, runId);
    const empInfo = await payslipRepo.findEmployeeInfo(client, items.map((i) => i.employeeId));
    const profiles = await profileRepo.listAll(client);
    const bank = await payslipBankRepo.findBank(client);
    return { run, items, empInfo, profiles, bank };
  });

  const empMap = new Map(ctx.empInfo.map((e) => [e.id, e]));
  const profMap = new Map(ctx.profiles.map((p) => [p.employeeId, p]));
  const format = ctx.bank?.bankFileFormat ?? 'generic_csv';
  const mode = ctx.bank?.paymentMode ?? 'neft';

  // Beneficiary rows — employees without a bank account are skipped & counted.
  const rows: BankRow[] = [];
  let skipped = 0;
  let total = 0;
  for (const it of ctx.items) {
    const prof = profMap.get(it.employeeId);
    const emp = empMap.get(it.employeeId);
    if (!prof?.bankAccountNumber || !prof?.bankIfsc) { skipped++; continue; }
    rows.push({
      name: prof.accountHolderName || emp?.name || 'Employee',
      account: prof.bankAccountNumber,
      ifsc: prof.bankIfsc,
      amount: it.net,
      email: emp?.email ?? null,
    });
    total += it.net;
  }
  if (rows.length === 0) {
    throw PayrollError.badRequest('No employees have a bank account on file — add bank details in Employee Pay Setup');
  }

  const csv = buildBankCsv(format, mode, ctx.run.periodLabel, rows);

  // ── Upload OUTSIDE any transaction ─────────────────────────────────────────
  const mm = String(ctx.run.month).padStart(2, '0');
  const key = `${actor.tenantId}/payroll/bank-files/${ctx.run.year}-${mm}/${runId}_${nanoid(8)}.csv`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: Buffer.from(csv, 'utf8'),
      ContentType: 'text/csv',
      ContentDisposition: `attachment; filename="bank-file-${ctx.run.year}-${mm}.csv"`,
    })
  );
  const fileUrl = `${publicBase()}/${key}`;

  // ── Write phase ────────────────────────────────────────────────────────────
  return withTenant(actor.tenantId, (client) =>
    repo.upsertBankFile(client, {
      runId, month: ctx.run.month, year: ctx.run.year, periodLabel: ctx.run.periodLabel,
      format, paymentMode: mode, employeeCount: rows.length, totalAmount: round2(total), skippedCount: skipped,
      fileUrl, fileKey: key, generatedBy: actor.userId,
    })
  );
}

export async function getForRun(actor: Actor, runId: string): Promise<PayBankFile | null> {
  return withTenant(actor.tenantId, (client) => repo.findByRun(client, runId));
}
