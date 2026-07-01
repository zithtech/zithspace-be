// src/modules/payroll/services/bankFileCsv.ts
//
// Builds a bank-disbursement CSV in the tenant's configured format. The column
// SET is the same across formats (beneficiary, account, IFSC, amount, mode,
// narration, email); the HEADER LABELS follow each bank's conventional naming.
// (Exact proprietary bank layouts vary; this produces a clean, ingestible CSV.)

import { BankFileFormat, PaymentMode } from '../types';

const HEADERS: Record<BankFileFormat, string[]> = {
  generic_csv: ['Beneficiary Name', 'Account Number', 'IFSC', 'Amount', 'Mode', 'Narration', 'Email'],
  hdfc: ['Beneficiary Name', 'Beneficiary Account Number', 'IFSC Code', 'Amount', 'Payment Type', 'Narration', 'Email'],
  icici: ['Payee Name', 'Account Number', 'IFSC', 'Amount', 'Mode', 'Remarks', 'Email'],
  sbi: ['Beneficiary Name', 'Account No', 'IFSC Code', 'Amount', 'Transaction Type', 'Narration', 'Email'],
  axis: ['Beneficiary Name', 'Account Number', 'IFSC', 'Amount', 'Mode', 'Narration', 'Email'],
  kotak: ['Beneficiary Name', 'Account Number', 'IFSC', 'Amount', 'Mode', 'Narration', 'Email'],
};

export interface BankRow {
  name: string;
  account: string;
  ifsc: string;
  amount: number;
  email: string | null;
}

function cell(v: string | number | null): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildBankCsv(
  format: BankFileFormat,
  paymentMode: PaymentMode,
  periodLabel: string,
  rows: BankRow[]
): string {
  const header = (HEADERS[format] ?? HEADERS.generic_csv).join(',');
  const mode = paymentMode.toUpperCase();
  const narration = `Salary ${periodLabel}`;
  const body = rows
    .map((r) => [r.name, r.account, r.ifsc, r.amount.toFixed(2), mode, narration, r.email ?? '']
      .map(cell).join(','))
    .join('\r\n');
  return `${header}\r\n${body}\r\n`;
}
