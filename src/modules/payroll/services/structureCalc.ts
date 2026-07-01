// src/modules/payroll/services/structureCalc.ts
//
// Deterministic salary-structure breakdown — the raw-SQL module's port of the
// legacy src/utils/salaryCalculation.ts, generalised to the new component model.
//
// Rules (preview-only — never throws; surfaces issues via `warning`):
//   • Earnings (category 'earning') must sum to the monthly gross. BASIC is
//     computed first; SPECIAL_ALLOWANCE absorbs the remainder so earnings == gross.
//   • Deductions reduce net pay. Benefits & reimbursements are employer/extra
//     cost on top of gross (they form CTC but not gross).
//   • A percentage line is `value`% of its base: 'basic' → computed BASIC,
//     'gross'/'ctc' → the monthly gross figure.

import { ComponentCategory, StructureTotals } from '../types';

const BASIC_CODE = 'BASIC';
const SPECIAL_CODE = 'SPECIAL_ALLOWANCE';

const round2 = (v: number) => Math.round(v * 100) / 100;

export interface CalcLineInput {
  key: string; // componentId — used for stable ordering / identity
  code: string;
  category: ComponentCategory;
  calculationType: 'fixed' | 'percentage';
  percentageOf: 'gross' | 'basic' | 'ctc' | null;
  value: number;
  displayOrder: number;
}

export interface CalcLineResult extends CalcLineInput {
  calculatedAmount: number;
}

export interface StructureBreakdown extends StructureTotals {
  lines: CalcLineResult[];
}

function amountOf(
  line: CalcLineInput,
  gross: number,
  basic: number
): number {
  if (line.calculationType === 'fixed') return round2(line.value);
  const base = line.percentageOf === 'basic' ? basic : gross; // gross/ctc → gross
  return round2((line.value / 100) * base);
}

/**
 * Compute the full breakdown for a structure against a reference monthly gross.
 * Returns each line with its calculatedAmount plus rolled-up totals.
 */
export function calcStructure(monthlyGross: number, input: CalcLineInput[]): StructureBreakdown {
  const gross = Math.max(0, round2(monthlyGross));
  const byOrder = [...input].sort((a, b) => a.displayOrder - b.displayOrder || a.code.localeCompare(b.code));

  const earnings = byOrder.filter((l) => l.category === 'earning');
  const deductions = byOrder.filter((l) => l.category === 'deduction');
  const extras = byOrder.filter((l) => l.category === 'benefit' || l.category === 'reimbursement');

  const results = new Map<string, number>();

  // 1) BASIC first (so percentage-of-basic lines resolve).
  const basicLine = earnings.find((l) => l.code.toUpperCase() === BASIC_CODE);
  let basic = 0;
  if (basicLine) {
    basic = amountOf(basicLine, gross, 0);
    results.set(basicLine.key, basic);
  }

  // 2) Other earnings (excluding BASIC and SPECIAL_ALLOWANCE).
  const specialLine = earnings.find((l) => l.code.toUpperCase() === SPECIAL_CODE);
  let earningsTotal = basic;
  for (const l of earnings) {
    const isBasic = l.code.toUpperCase() === BASIC_CODE;
    const isSpecial = l.code.toUpperCase() === SPECIAL_CODE;
    if (isBasic || isSpecial) continue;
    const amt = amountOf(l, gross, basic);
    results.set(l.key, amt);
    earningsTotal += amt;
  }
  earningsTotal = round2(earningsTotal);

  // 3) SPECIAL_ALLOWANCE balances earnings up to gross.
  let warning: string | undefined;
  let balanced = true;
  const remaining = round2(gross - earningsTotal);
  if (specialLine) {
    const special = Math.max(0, remaining);
    results.set(specialLine.key, special);
    earningsTotal = round2(earningsTotal + special);
    if (remaining < 0) {
      balanced = false;
      warning = `Fixed earnings exceed the monthly gross by ${Math.abs(remaining).toLocaleString()}.`;
    }
  } else if (Math.abs(remaining) > 0.01 && gross > 0) {
    balanced = false;
    warning = `Earnings total ${earningsTotal.toLocaleString()} does not match gross ${gross.toLocaleString()}. Add a "Special Allowance" component to balance.`;
  }

  // 4) Deductions & extras (computed, not part of gross balancing).
  let deductionsTotal = 0;
  for (const l of deductions) {
    const amt = amountOf(l, gross, basic);
    results.set(l.key, amt);
    deductionsTotal += amt;
  }
  let benefitsTotal = 0;
  for (const l of extras) {
    const amt = amountOf(l, gross, basic);
    results.set(l.key, amt);
    benefitsTotal += amt;
  }

  const lines: CalcLineResult[] = byOrder.map((l) => ({ ...l, calculatedAmount: results.get(l.key) ?? 0 }));

  return {
    lines,
    totalEarnings: round2(earningsTotal),
    totalDeductions: round2(deductionsTotal),
    totalBenefits: round2(benefitsTotal),
    grossSalary: round2(earningsTotal),
    netSalary: round2(earningsTotal - deductionsTotal),
    ctc: round2(earningsTotal + benefitsTotal),
    balanced,
    warning,
  };
}
