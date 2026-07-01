// src/modules/payroll/services/payRunCalc.ts
//
// Per-employee pay computation for a run. Takes an employee's frozen breakdown
// (full monthly amounts) and prorates by paid days:
//
//   factor   = (totalDays − lopDays) / totalDays
//   amount   = isProRata ? fullAmount × factor : fullAmount
//   gross    = Σ prorated earnings
//   net      = gross − Σ prorated deductions
//   lopDed   = Σ full earnings − Σ prorated earnings   (informational)
//
// Benefits/reimbursements are computed but excluded from gross & net (they are
// employer cost / over-and-above, mirroring the structure calc).

import { ComponentCategory } from '../types';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface RunLineInput {
  componentId: string;
  code: string;
  name: string;
  category: ComponentCategory;
  isProRata: boolean;
  fullAmount: number;
}

export interface RunLineResult extends RunLineInput {
  amount: number;
}

export interface ItemComputation {
  totalDays: number;
  lopDays: number;
  paidDays: number;
  lines: RunLineResult[];
  gross: number;
  totalDeductions: number;
  net: number;
  lopDeduction: number;
}

export function computeItem(totalDays: number, lopDaysRaw: number, lines: RunLineInput[]): ItemComputation {
  const days = totalDays > 0 ? totalDays : 30;
  const lopDays = Math.min(Math.max(0, lopDaysRaw), days);
  const paidDays = round2(days - lopDays);
  const factor = days > 0 ? paidDays / days : 1;

  const results: RunLineResult[] = lines.map((l) => ({
    ...l,
    amount: round2(l.isProRata ? l.fullAmount * factor : l.fullAmount),
  }));

  let earnings = 0, fullEarnings = 0, deductions = 0;
  for (const l of results) {
    if (l.category === 'earning') { earnings += l.amount; fullEarnings += l.fullAmount; }
    else if (l.category === 'deduction') deductions += l.amount;
  }
  earnings = round2(earnings); deductions = round2(deductions);

  return {
    totalDays: days,
    lopDays,
    paidDays,
    lines: results,
    gross: earnings,
    totalDeductions: deductions,
    net: round2(earnings - deductions),
    lopDeduction: round2(round2(fullEarnings) - earnings),
  };
}

/** Calendar days in a given month (month is 1-based). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
