// src/modules/payroll/services/payslip.service.ts
//
// Generates payslip PDFs for a finalized/paid run. Follows the performance-
// report pattern: read inside a tx → render + upload to R2 OUTSIDE any tx (slow
// Puppeteer/network work) → persist the records in a short final tx.

import { withTenant, TenantClient } from '../db/pool';
import * as repo from '../repositories/payslip.repo';
import * as runRepo from '../repositories/payRun.repo';
import * as profileRepo from '../repositories/profile.repo';
import * as payslipBankRepo from '../repositories/payslipBank.repo';
import * as settingsRepo from '../repositories/settings.repo';
import { renderAndUploadPayslips, PayslipRenderInput } from './payslipPdf';
import { buildPayslipHtml, PayslipData, PayslipLine } from './payslipHtml';
import { Actor, EmployeeBasicInfo, EmployeeProfile, PayPayslip, PayrollError, PayRun, PayRunItem, PayslipTemplate } from '../types';
import { UpdatePayslipTemplateInput } from '../validators/payslipBank.validator';

const round2 = (n: number) => Math.round(n * 100) / 100;

function lines(item: PayRunItem, category: 'earning' | 'deduction' | 'reimbursement' | 'benefit', ytd?: Record<string, number>): PayslipLine[] {
  return item.components
    .filter((c) => c.category === category && Math.abs(c.amount) > 0.001)
    .map((c) => ({ name: c.name, amount: c.amount, ytd: ytd ? (ytd[c.code] ?? c.amount) : undefined }));
}

// Financial-year window (key = year*12 + month) for YTD totals, plus the pay
// date (configured pay day of the run's month, clamped to month length).
function fyWindowAndPayDate(run: { year: number; month: number }, settings: { financialYearStartMonth?: number; payDay?: number } | null) {
  const fyStart = settings?.financialYearStartMonth ?? 4;
  const fyStartYear = run.month >= fyStart ? run.year : run.year - 1;
  const fromKey = fyStartYear * 12 + fyStart;
  const toKey = run.year * 12 + run.month;
  const payDay = settings?.payDay ?? 1;
  const dim = new Date(run.year, run.month, 0).getDate();
  const payDate = `${run.year}-${String(run.month).padStart(2, '0')}-${String(Math.min(payDay, dim)).padStart(2, '0')}`;
  return { fromKey, toKey, payDate };
}

/** Everything a run needs to render payslips: run + settings + per-employee info/profile/YTD. */
async function readPayslipContext(client: TenantClient, runId: string) {
  const run = await runRepo.findRunById(client, runId);
  if (!run) throw PayrollError.notFound('Pay run');
  const items = await runRepo.findItems(client, runId);

  const empInfo = await repo.findEmployeeInfo(client, items.map((i) => i.employeeId));
  const profiles = await profileRepo.listAll(client);
  const template = await payslipBankRepo.findTemplate(client);
  const companyName = await repo.findCompanyName(client);
  const settings = await settingsRepo.findSettings(client);

  const { fromKey, toKey, payDate } = fyWindowAndPayDate(run, settings);
  const ytdByEmployee = new Map<string, Record<string, number>>();
  for (const it of items) {
    ytdByEmployee.set(it.employeeId, await repo.findYtdByCode(client, it.employeeId, fromKey, toKey));
  }

  return { run, items, empInfo, profiles, template, companyName, ytdByEmployee, payDate };
}

/** Build the render data for ONE employee's payslip (used by the async worker).
 *  Loads only what that employee needs — a handful of small queries. Returns the
 *  run + item too so the worker can persist the payslip record. */
export async function buildPayslipDataForEmployee(
  client: TenantClient, runId: string, employeeId: string
): Promise<{ data: PayslipData; run: PayRun; item: PayRunItem }> {
  const run = await runRepo.findRunById(client, runId);
  if (!run) throw PayrollError.notFound('Pay run');
  const item = await runRepo.findItemByEmployee(client, runId, employeeId);
  if (!item) throw PayrollError.notFound('Pay run item');

  const [emp] = await repo.findEmployeeInfo(client, [employeeId]);
  const prof = await profileRepo.findByEmployee(client, employeeId);
  const template = await payslipBankRepo.findTemplate(client);
  const companyName = await repo.findCompanyName(client);
  const settings = await settingsRepo.findSettings(client);
  const { fromKey, toKey, payDate } = fyWindowAndPayDate(run, settings);
  const ytd = await repo.findYtdByCode(client, employeeId, fromKey, toKey);

  const data = toPayslipData(item, emp, prof ?? null, template, companyName, run.periodLabel, payDate, ytd);
  return { data, run, item };
}

// Build the payslip render data for one run item (shared shape for all templates).
function toPayslipData(
  item: PayRunItem,
  emp: EmployeeBasicInfo | undefined,
  prof: EmployeeProfile | null,
  t: PayslipTemplate | null,
  companyName: string,
  periodLabel: string,
  payDate: string | null,
  ytd: Record<string, number>
): PayslipData {
  const earnings = lines(item, 'earning', ytd);
  const deductions = lines(item, 'deduction', ytd);
  const extras = [...lines(item, 'reimbursement', ytd), ...lines(item, 'benefit', ytd)];
  const sumYtd = (ls: PayslipLine[]) => round2(ls.reduce((s, l) => s + (l.ytd ?? l.amount), 0));
  return {
    templateStyle: t?.templateStyle ?? 'modern',
    companyName: t?.companyName || companyName,
    companyAddress: t?.companyAddress ?? null,
    periodLabel,
    accentColor: t?.accentColor ?? '#3B82F6',
    footerNote: t?.footerNote ?? null,
    netPayInWords: t?.netPayInWords ?? true,
    showLogo: t?.showLogo ?? true,
    logoUrl: t?.logoUrl ?? null,
    showEmployeeCode: t?.showEmployeeCode ?? true,
    showEmail: t?.showEmail ?? true,
    showDesignation: t?.showDesignation ?? true,
    showDepartment: t?.showDepartment ?? true,
    showGrade: t?.showGrade ?? false,
    showLocation: t?.showLocation ?? false,
    showDateOfJoining: t?.showDateOfJoining ?? true,
    showBankName: t?.showBankName ?? true,
    showPan: t?.showPan ?? true,
    showUan: t?.showUan ?? true,
    showPfNumber: t?.showPfNumber ?? true,
    showEsiNumber: t?.showEsiNumber ?? true,
    showBankAccount: t?.showBankAccount ?? true,
    showYtd: t?.showYtd ?? false,
    showAttendanceSummary: t?.showAttendanceSummary ?? true,
    employee: {
      name: emp?.name ?? 'Employee', email: emp?.email ?? null, designation: emp?.designation ?? null,
      code: emp?.employeeCode ?? null, department: emp?.department ?? null, grade: emp?.grade ?? null,
      location: emp?.location ?? null, dateOfJoining: emp?.dateOfJoining ?? null,
    },
    profile: prof
      ? {
          pan: prof.pan, uan: prof.uan, pfNumber: prof.pfNumber, esiNumber: prof.esiNumber,
          bankName: prof.bankName, bankAccountNumber: prof.bankAccountNumber, bankIfsc: prof.bankIfsc,
        }
      : null,
    payDate,
    totalDays: item.totalDays,
    paidDays: item.paidDays,
    lopDays: item.lopDays,
    earnings, deductions, extras,
    gross: item.gross,
    totalDeductions: item.totalDeductions,
    net: item.net,
    grossYtd: sumYtd(earnings),
    deductionsYtd: sumYtd(deductions),
    extrasYtd: sumYtd(extras),
  };
}

export async function generateForRun(actor: Actor, runId: string): Promise<{ generated: number; payslips: PayPayslip[] }> {
  // ── Read phase ──────────────────────────────────────────────────────────────
  const ctx = await withTenant(actor.tenantId, async (client) => {
    const c = await readPayslipContext(client, runId);
    if (c.run.status !== 'finalized' && c.run.status !== 'paid') {
      throw PayrollError.badRequest('Finalize the run before generating payslips');
    }
    if (c.items.length === 0) throw PayrollError.badRequest('Run has no items');
    return c;
  });

  const empMap = new Map(ctx.empInfo.map((e) => [e.id, e]));
  const profMap = new Map(ctx.profiles.map((p) => [p.employeeId, p]));
  const t = ctx.template;

  // ── Build HTML for each item ───────────────────────────────────────────────
  const inputs: PayslipRenderInput[] = ctx.items.map((it) => ({
    employeeId: it.employeeId,
    html: buildPayslipHtml(
      toPayslipData(it, empMap.get(it.employeeId), profMap.get(it.employeeId) ?? null, t, ctx.companyName, ctx.run.periodLabel, ctx.payDate, ctx.ytdByEmployee.get(it.employeeId) ?? {})
    ),
  }));

  // ── Render + upload OUTSIDE any transaction ────────────────────────────────
  const rendered = await renderAndUploadPayslips(inputs, { tenantId: actor.tenantId, year: ctx.run.year, month: ctx.run.month });
  const renderedMap = new Map(rendered.map((r) => [r.employeeId, r]));

  // ── Write phase ────────────────────────────────────────────────────────────
  const payslips = await withTenant(actor.tenantId, async (client) => {
    const out: PayPayslip[] = [];
    for (const it of ctx.items) {
      const r = renderedMap.get(it.employeeId);
      if (!r) continue;
      out.push(
        await repo.upsertPayslip(client, {
          runId, employeeId: it.employeeId, month: ctx.run.month, year: ctx.run.year, periodLabel: ctx.run.periodLabel,
          gross: it.gross, totalDeductions: it.totalDeductions, net: it.net, lopDays: it.lopDays,
          fileUrl: r.fileUrl, fileKey: r.fileKey, generatedBy: actor.userId,
        })
      );
    }
    return out;
  });

  return { generated: payslips.length, payslips };
}

// Example payslip data for the settings preview (not tied to any employee/run).
const SAMPLE_PAYSLIP = {
  periodLabel: 'March 2024',
  payDate: '2024-03-29',
  employee: { name: 'Gaurav Sharma', email: 'gaurav@company.com', designation: 'Associate Editor', code: 'EMP-43521', department: 'Editorial', grade: 'L3 – Senior', location: 'Bengaluru', dateOfJoining: '2020-06-30' },
  profile: {
    pan: 'ABCDE1234F', uan: '100200300400', pfNumber: 'KA/BNG/0012345/678', esiNumber: '3100012345',
    bankName: 'HDFC Bank', bankAccountNumber: '50100123456789', bankIfsc: 'HDFC0001234',
  },
  totalDays: 31, paidDays: 31, lopDays: 0,
  earnings: [
    { name: 'Basic', amount: 43750, ytd: 131250 }, { name: 'House Rent Allowance', amount: 21875, ytd: 65625 },
    { name: 'Conveyance Allowance', amount: 6000, ytd: 18000 }, { name: 'Children Education Allowance', amount: 4000, ytd: 12000 },
    { name: 'Fixed Allowance', amount: 6625, ytd: 19875 },
  ],
  deductions: [{ name: 'EPF Contribution', amount: 5250, ytd: 15750 }, { name: 'Professional Tax', amount: 200, ytd: 600 }],
  extras: [{ name: 'Telephone Reimbursement', amount: 500, ytd: 1500 }, { name: 'Fuel Reimbursement', amount: 2000, ytd: 6000 }],
  gross: 82250, totalDeductions: 5450, net: 76800, grossYtd: 246750, deductionsYtd: 16350, extrasYtd: 7500,
};

/** Render a SAMPLE payslip with the given template config — for the settings
 *  preview drawer. Uses example data + the tenant's company name. */
export async function renderSampleHtml(actor: Actor, cfg: UpdatePayslipTemplateInput): Promise<string> {
  const companyName = await withTenant(actor.tenantId, (client) => repo.findCompanyName(client));
  const data: PayslipData = {
    templateStyle: cfg.templateStyle ?? 'modern',
    companyName: cfg.companyName || companyName,
    companyAddress: cfg.companyAddress || 'Level 4, Prestige Tech Park, Bengaluru 560103',
    periodLabel: SAMPLE_PAYSLIP.periodLabel,
    accentColor: cfg.accentColor ?? '#3B82F6',
    footerNote: cfg.footerNote ?? null,
    netPayInWords: cfg.netPayInWords ?? true,
    showLogo: cfg.showLogo ?? true,
    logoUrl: cfg.logoUrl ?? null,
    showEmployeeCode: cfg.showEmployeeCode ?? true, showEmail: cfg.showEmail ?? true,
    showDesignation: cfg.showDesignation ?? true, showDepartment: cfg.showDepartment ?? true,
    showGrade: cfg.showGrade ?? false, showLocation: cfg.showLocation ?? false,
    showDateOfJoining: cfg.showDateOfJoining ?? true, showBankName: cfg.showBankName ?? true,
    showPan: cfg.showPan ?? true, showUan: cfg.showUan ?? true, showPfNumber: cfg.showPfNumber ?? true,
    showEsiNumber: cfg.showEsiNumber ?? true, showBankAccount: cfg.showBankAccount ?? true,
    showYtd: cfg.showYtd ?? false, showAttendanceSummary: cfg.showAttendanceSummary ?? true,
    employee: SAMPLE_PAYSLIP.employee,
    profile: SAMPLE_PAYSLIP.profile,
    payDate: SAMPLE_PAYSLIP.payDate,
    totalDays: SAMPLE_PAYSLIP.totalDays, paidDays: SAMPLE_PAYSLIP.paidDays, lopDays: SAMPLE_PAYSLIP.lopDays,
    earnings: SAMPLE_PAYSLIP.earnings, deductions: SAMPLE_PAYSLIP.deductions, extras: SAMPLE_PAYSLIP.extras,
    gross: SAMPLE_PAYSLIP.gross, totalDeductions: SAMPLE_PAYSLIP.totalDeductions, net: SAMPLE_PAYSLIP.net,
    grossYtd: SAMPLE_PAYSLIP.grossYtd, deductionsYtd: SAMPLE_PAYSLIP.deductionsYtd, extrasYtd: SAMPLE_PAYSLIP.extrasYtd,
  };
  return buildPayslipHtml(data);
}

export async function listForRun(actor: Actor, runId: string): Promise<PayPayslip[]> {
  return withTenant(actor.tenantId, (client) => repo.findByRun(client, runId));
}

export async function listForEmployee(actor: Actor, employeeId: string): Promise<PayPayslip[]> {
  return withTenant(actor.tenantId, (client) => repo.findForEmployee(client, employeeId));
}
