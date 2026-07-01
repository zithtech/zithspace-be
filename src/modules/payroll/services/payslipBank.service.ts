// src/modules/payroll/services/payslipBank.service.ts
//
// Business logic for payslip template & bank settings. Seeds sensible defaults
// on first read so both forms always have a complete payload.

import { withTenant, TenantClient } from '../db/pool';
import * as repo from '../repositories/payslipBank.repo';
import { uploadPayslipLogo } from './payslipLogo';
import { Actor, BankSettings, PayslipTemplate } from '../types';
import { UpdateBankSettingsInput, UpdatePayslipTemplateInput } from '../validators/payslipBank.validator';

// ── Payslip template ──────────────────────────────────────────────────────────
export async function getTemplate(actor: Actor): Promise<PayslipTemplate> {
  return withTenant(actor.tenantId, (client) => ensureTemplate(client, actor.userId));
}

export async function updateTemplate(actor: Actor, input: UpdatePayslipTemplateInput): Promise<PayslipTemplate> {
  return withTenant(actor.tenantId, (client) =>
    repo.upsertTemplate(client, {
      templateStyle: input.templateStyle,
      showLogo: input.showLogo,
      logoUrl: input.logoUrl ?? null,
      companyName: input.companyName ?? null,
      companyAddress: input.companyAddress ?? null,
      accentColor: input.accentColor,
      footerNote: input.footerNote ?? null,
      netPayInWords: input.netPayInWords,
      showEmployeeCode: input.showEmployeeCode,
      showEmail: input.showEmail,
      showDesignation: input.showDesignation,
      showDepartment: input.showDepartment,
      showGrade: input.showGrade,
      showLocation: input.showLocation,
      showDateOfJoining: input.showDateOfJoining,
      showBankName: input.showBankName,
      showPan: input.showPan,
      showUan: input.showUan,
      showPfNumber: input.showPfNumber,
      showEsiNumber: input.showEsiNumber,
      showBankAccount: input.showBankAccount,
      showYtd: input.showYtd,
      showLeaveBalance: input.showLeaveBalance,
      showAttendanceSummary: input.showAttendanceSummary,
      actorId: actor.userId,
    })
  );
}

// Upload a company logo to R2 and return its public URL. The URL is then set on
// the template via updateTemplate (kept as two steps so the logo persists only
// when the user saves).
export async function uploadLogo(actor: Actor, image: string): Promise<{ url: string }> {
  const { url } = await uploadPayslipLogo(actor.tenantId, image);
  return { url };
}

async function ensureTemplate(client: TenantClient, actorId: string): Promise<PayslipTemplate> {
  const existing = await repo.findTemplate(client);
  if (existing) return existing;
  return repo.upsertTemplate(client, {
    templateStyle: 'modern', showLogo: true, logoUrl: null, companyName: null, companyAddress: null,
    accentColor: '#3B82F6', footerNote: null, netPayInWords: true,
    showEmployeeCode: true, showEmail: true, showDesignation: true, showDepartment: true,
    showGrade: false, showLocation: false, showDateOfJoining: true, showBankName: true,
    showPan: true, showUan: true, showPfNumber: true, showEsiNumber: true, showBankAccount: true,
    showYtd: false, showLeaveBalance: true, showAttendanceSummary: false, actorId,
  });
}

// ── Bank settings ─────────────────────────────────────────────────────────────
export async function getBank(actor: Actor): Promise<BankSettings> {
  return withTenant(actor.tenantId, (client) => ensureBank(client, actor.userId));
}

export async function updateBank(actor: Actor, input: UpdateBankSettingsInput): Promise<BankSettings> {
  return withTenant(actor.tenantId, (client) =>
    repo.upsertBank(client, {
      companyBankName: input.companyBankName ?? null,
      companyAccountNumber: input.companyAccountNumber ?? null,
      companyIfsc: input.companyIfsc ?? null,
      paymentMode: input.paymentMode,
      bankFileFormat: input.bankFileFormat,
      actorId: actor.userId,
    })
  );
}

async function ensureBank(client: TenantClient, actorId: string): Promise<BankSettings> {
  const existing = await repo.findBank(client);
  if (existing) return existing;
  return repo.upsertBank(client, {
    companyBankName: null, companyAccountNumber: null, companyIfsc: null,
    paymentMode: 'neft', bankFileFormat: 'generic_csv', actorId,
  });
}
