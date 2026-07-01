// src/modules/payroll/repositories/payslipBank.repo.ts
//
// Raw-SQL data access for pay_payslip_template and pay_bank_settings (one row
// per tenant each). Every query takes a tenant-scoped client AND filters tenant_id.

import { TenantClient } from '../db/pool';
import { BankSettings, PayslipTemplate } from '../types';

// ── Payslip template ──────────────────────────────────────────────────────────
const TPL_COLS = `
  id, tenant_id, template_style, show_logo, logo_url, company_name, company_address,
  accent_color, footer_note, net_pay_in_words,
  show_employee_code, show_email, show_designation, show_department, show_grade,
  show_location, show_date_of_joining, show_bank_name,
  show_pan, show_uan, show_pf_number, show_esi_number, show_bank_account,
  show_ytd, show_leave_balance, show_attendance_summary,
  created_by, updated_by, created_at, updated_at
`;

function mapTpl(r: any): PayslipTemplate {
  return {
    id: r.id, tenantId: r.tenant_id, templateStyle: r.template_style, showLogo: r.show_logo,
    logoUrl: r.logo_url, companyName: r.company_name, companyAddress: r.company_address,
    accentColor: r.accent_color, footerNote: r.footer_note, netPayInWords: r.net_pay_in_words,
    showEmployeeCode: r.show_employee_code, showEmail: r.show_email, showDesignation: r.show_designation,
    showDepartment: r.show_department, showGrade: r.show_grade, showLocation: r.show_location,
    showDateOfJoining: r.show_date_of_joining, showBankName: r.show_bank_name,
    showPan: r.show_pan, showUan: r.show_uan, showPfNumber: r.show_pf_number,
    showEsiNumber: r.show_esi_number, showBankAccount: r.show_bank_account,
    showYtd: r.show_ytd, showLeaveBalance: r.show_leave_balance, showAttendanceSummary: r.show_attendance_summary,
    createdBy: r.created_by, updatedBy: r.updated_by, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export async function findTemplate(client: TenantClient): Promise<PayslipTemplate | null> {
  const { rows } = await client.query(`SELECT ${TPL_COLS} FROM pay_payslip_template WHERE tenant_id = $1`, [client.tenantId]);
  return rows[0] ? mapTpl(rows[0]) : null;
}

export interface UpsertTemplateData {
  templateStyle: 'modern' | 'classic' | 'minimal';
  showLogo: boolean;
  logoUrl: string | null;
  companyName: string | null;
  companyAddress: string | null;
  accentColor: string;
  footerNote: string | null;
  netPayInWords: boolean;
  showEmployeeCode: boolean;
  showEmail: boolean;
  showDesignation: boolean;
  showDepartment: boolean;
  showGrade: boolean;
  showLocation: boolean;
  showDateOfJoining: boolean;
  showBankName: boolean;
  showPan: boolean;
  showUan: boolean;
  showPfNumber: boolean;
  showEsiNumber: boolean;
  showBankAccount: boolean;
  showYtd: boolean;
  showLeaveBalance: boolean;
  showAttendanceSummary: boolean;
  actorId: string;
}

export async function upsertTemplate(client: TenantClient, d: UpsertTemplateData): Promise<PayslipTemplate> {
  const { rows } = await client.query(
    `INSERT INTO pay_payslip_template
       (tenant_id, template_style, show_logo, logo_url, company_name, company_address,
        accent_color, footer_note, net_pay_in_words,
        show_employee_code, show_email, show_designation, show_department, show_grade, show_location,
        show_date_of_joining, show_bank_name,
        show_pan, show_uan, show_pf_number, show_esi_number, show_bank_account, show_ytd, show_leave_balance,
        show_attendance_summary, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$26)
     ON CONFLICT (tenant_id) DO UPDATE SET
       template_style = EXCLUDED.template_style,
       show_logo = EXCLUDED.show_logo, logo_url = EXCLUDED.logo_url,
       company_name = EXCLUDED.company_name, company_address = EXCLUDED.company_address,
       accent_color = EXCLUDED.accent_color,
       footer_note = EXCLUDED.footer_note, net_pay_in_words = EXCLUDED.net_pay_in_words,
       show_employee_code = EXCLUDED.show_employee_code, show_email = EXCLUDED.show_email,
       show_designation = EXCLUDED.show_designation, show_department = EXCLUDED.show_department,
       show_grade = EXCLUDED.show_grade, show_location = EXCLUDED.show_location,
       show_date_of_joining = EXCLUDED.show_date_of_joining, show_bank_name = EXCLUDED.show_bank_name,
       show_pan = EXCLUDED.show_pan, show_uan = EXCLUDED.show_uan, show_pf_number = EXCLUDED.show_pf_number,
       show_esi_number = EXCLUDED.show_esi_number, show_bank_account = EXCLUDED.show_bank_account,
       show_ytd = EXCLUDED.show_ytd, show_leave_balance = EXCLUDED.show_leave_balance,
       show_attendance_summary = EXCLUDED.show_attendance_summary,
       updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING ${TPL_COLS}`,
    [
      client.tenantId, d.templateStyle, d.showLogo, d.logoUrl, d.companyName, d.companyAddress,
      d.accentColor, d.footerNote, d.netPayInWords,
      d.showEmployeeCode, d.showEmail, d.showDesignation, d.showDepartment, d.showGrade, d.showLocation,
      d.showDateOfJoining, d.showBankName,
      d.showPan, d.showUan, d.showPfNumber, d.showEsiNumber, d.showBankAccount, d.showYtd, d.showLeaveBalance,
      d.showAttendanceSummary, d.actorId,
    ]
  );
  return mapTpl(rows[0]);
}

// ── Bank settings ─────────────────────────────────────────────────────────────
const BANK_COLS = `
  id, tenant_id, company_bank_name, company_account_number, company_ifsc,
  payment_mode, bank_file_format, created_by, updated_by, created_at, updated_at
`;

function mapBank(r: any): BankSettings {
  return {
    id: r.id, tenantId: r.tenant_id, companyBankName: r.company_bank_name,
    companyAccountNumber: r.company_account_number, companyIfsc: r.company_ifsc,
    paymentMode: r.payment_mode, bankFileFormat: r.bank_file_format,
    createdBy: r.created_by, updatedBy: r.updated_by, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export async function findBank(client: TenantClient): Promise<BankSettings | null> {
  const { rows } = await client.query(`SELECT ${BANK_COLS} FROM pay_bank_settings WHERE tenant_id = $1`, [client.tenantId]);
  return rows[0] ? mapBank(rows[0]) : null;
}

export interface UpsertBankData {
  companyBankName: string | null;
  companyAccountNumber: string | null;
  companyIfsc: string | null;
  paymentMode: BankSettings['paymentMode'];
  bankFileFormat: BankSettings['bankFileFormat'];
  actorId: string;
}

export async function upsertBank(client: TenantClient, d: UpsertBankData): Promise<BankSettings> {
  const { rows } = await client.query(
    `INSERT INTO pay_bank_settings
       (tenant_id, company_bank_name, company_account_number, company_ifsc, payment_mode, bank_file_format, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
     ON CONFLICT (tenant_id) DO UPDATE SET
       company_bank_name = EXCLUDED.company_bank_name,
       company_account_number = EXCLUDED.company_account_number,
       company_ifsc = EXCLUDED.company_ifsc,
       payment_mode = EXCLUDED.payment_mode,
       bank_file_format = EXCLUDED.bank_file_format,
       updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING ${BANK_COLS}`,
    [client.tenantId, d.companyBankName, d.companyAccountNumber, d.companyIfsc, d.paymentMode, d.bankFileFormat, d.actorId]
  );
  return mapBank(rows[0]);
}
