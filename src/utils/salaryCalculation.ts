import { CalculationType, PercentageBasis } from "@prisma/client";

export interface SalaryComponentInput {
  componentId: number;
  componentCode: string;
  componentName: string; // Added for better error reporting
  type: "Earning" | "Deduction";
  calculationType: CalculationType;
  percentageBasis: PercentageBasis | null;
  value: number;
}

export interface CalculatedComponent extends SalaryComponentInput {
  calculatedAmount: number;
}

/**
 * Deterministically calculates a full salary breakdown from a set of rules and a target gross.
 * Standardizes on 2-decimal rounding to ensure consistency between frontend and backend.
 */
export function calculateSalaryStructure(
  grossSalary: number,
  components: SalaryComponentInput[]
): CalculatedComponent[] {
  // 0. Sanity Checks
  if (grossSalary < 0) {
    throw new Error("Monthly Gross salary cannot be negative.");
  }

  // 1. Identify key components and check for duplicates
  const componentIds = new Set<number>();
  const earnings: SalaryComponentInput[] = [];
  const deductions: SalaryComponentInput[] = [];

  for (const c of components) {
    if (componentIds.has(c.componentId)) {
      throw new Error(`Duplicate component found: ${c.componentName} (ID: ${c.componentId})`);
    }
    componentIds.add(c.componentId);

    if (c.value < 0) {
      throw new Error(`Component value for ${c.componentName} cannot be negative.`);
    }

    if (c.calculationType === "PERCENTAGE" && c.value > 100) {
      throw new Error(`Percentage value for ${c.componentName} cannot exceed 100%.`);
    }

    if (c.type === "Earning") earnings.push(c);
    else deductions.push(c);
  }

  // Basic is no longer strictly required for the template itself.
  // We'll calculate it only if it exists.
  const basicComponent = earnings.find((c) => c.componentCode === "BASIC");

  if (basicComponent && basicComponent.calculationType === "PERCENTAGE" && basicComponent.percentageBasis === "BASIC") {
    throw new Error("The 'BASIC' component cannot be calculated as a percentage of itself.");
  }

  if (grossSalary === 0) {
    return components.map(c => ({ ...c, calculatedAmount: 0 }));
  }

  const specialAllowanceCode = "SPECIAL_ALLOWANCE";
  const specialAllowance = earnings.find((c) => c.componentCode === specialAllowanceCode);

  const result: CalculatedComponent[] = [];
  const round2 = (val: number) => Math.round(val * 100) / 100;

  // 2. Calculate BASIC first
  let basicAmount = 0;
  if (basicComponent) {
    if (basicComponent.calculationType === "FIXED") {
      basicAmount = basicComponent.value;
    } else {
      // Basic must be on Gross
      basicAmount = (basicComponent.value / 100) * grossSalary;
    }
    basicAmount = round2(basicAmount);
    result.push({ ...basicComponent, calculatedAmount: basicAmount });
  }

  // 3. Process all Earnings (except BASIC and Special Allowance)
  let currentEarningsTotal = basicAmount;

  const otherEarnings = earnings
    .filter((c) => c.componentCode !== "BASIC" && c.componentCode !== specialAllowanceCode)
    .sort((a, b) => a.componentId - b.componentId); // Deterministic ordering

  for (const comp of otherEarnings) {
    let amount = 0;
    if (comp.calculationType === "FIXED") {
      amount = comp.value;
    } else {
      const basis = comp.percentageBasis === "BASIC" ? basicAmount : grossSalary;
      amount = (comp.value / 100) * basis;
    }
    amount = round2(amount);
    result.push({ ...comp, calculatedAmount: amount });
    currentEarningsTotal += amount;
  }

  // 4. Auto-balance with Special Allowance
  currentEarningsTotal = round2(currentEarningsTotal);
  const remaining = round2(grossSalary - currentEarningsTotal);

  if (remaining !== 0) {
    if (specialAllowance) {
      // Special Allowance absorbs the remaining amount. 
      const specialAmount = Math.max(0, remaining);
      result.push({ 
        ...specialAllowance, 
        calculatedAmount: specialAmount 
      });
      currentEarningsTotal = round2(currentEarningsTotal + specialAmount);
    } else if (Math.abs(remaining) > 0.01) {
      throw new Error(`Total earnings (₹${currentEarningsTotal}) do not match monthly gross (₹${grossSalary}). Add 'Special Allowance' to balance.`);
    }
  } else if (specialAllowance) {
    result.push({ ...specialAllowance, calculatedAmount: 0 });
  }

  // 5. Final validate: Total Earnings must equal Gross (within 0.01)
  if (Math.abs(round2(currentEarningsTotal) - grossSalary) > 0.01) {
    throw new Error(`Critical calculation error: Total earnings (₹${currentEarningsTotal}) mismatch Gross (₹${grossSalary}). Please check Special Allowance rules.`);
  }

  // 6. Process Deductions
  for (const comp of deductions.sort((a, b) => a.componentId - b.componentId)) {
    let amount = 0;
    if (comp.calculationType === "FIXED") {
      amount = comp.value;
    } else {
      const basis = comp.percentageBasis === "BASIC" ? basicAmount : grossSalary;
      amount = (comp.value / 100) * basis;
    }
    amount = round2(amount);
    result.push({ ...comp, calculatedAmount: amount });
  }

  return result;
}
