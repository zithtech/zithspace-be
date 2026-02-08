// src/services/salary.service.ts

/* =====================================================
   TYPES
===================================================== */

type Earning = {
  name: string;
  percentage: number;
};

type Deduction = {
  name: string;
  type: "BASIC_PERCENT" | "GROSS_PERCENT" | "FIXED";
  value: number;
};

export interface SalaryStructureCalc {
  grossSalary: number;
  earnings: Earning[];
  deductions: Deduction[];
  deductionsEnabled: boolean;
};

/* =====================================================
   CORE CALCULATIONS
===================================================== */

// Calculate earnings amounts
export const calculateEarnings = (structure: SalaryStructureCalc) => {
  return structure.earnings.map(e => ({
    ...e,
    amount: Math.round((structure.grossSalary * e.percentage) / 100),
  }));
};

// Get Basic Pay
export const getBasicPay = (structure: SalaryStructureCalc): number => {
  const earnings = calculateEarnings(structure);
  return (
    earnings.find(e =>
      e.name.toLowerCase().includes("basic")
    )?.amount || 0
  );
};

// Calculate deductions
export const calculateDeductionAmounts = (
  structure: SalaryStructureCalc
) => {
  if (!structure.deductionsEnabled) return [];

  const basicPay = getBasicPay(structure);

  return structure.deductions.map(d => {
    let amount = 0;

    switch (d.type) {
      case "BASIC_PERCENT":
        amount = Math.round((basicPay * d.value) / 100);
        break;

      case "GROSS_PERCENT":
        amount = Math.round(
          (structure.grossSalary * d.value) / 100
        );
        break;

      case "FIXED":
        amount = d.value;
        break;
    }

    return { ...d, amount };
  });
};

// Totals
export const calculateTotalEarnings = (
  structure: SalaryStructureCalc
) =>
  calculateEarnings(structure).reduce(
    (sum, e) => sum + e.amount,
    0
  );

export const calculateTotalDeductions = (
  structure: SalaryStructureCalc
) =>
  structure.deductionsEnabled
    ? calculateDeductionAmounts(structure).reduce(
        (sum, d) => sum + d.amount,
        0
      )
    : 0;

export const calculateNetPay = (
  structure: SalaryStructureCalc
) =>
  structure.grossSalary -
  calculateTotalDeductions(structure);

/* =====================================================
   MAIN FUNCTION (USED BY CONTROLLER)
===================================================== */

export const calculateSalary = ({
  employee,
  attendance,
  reimbursements,
  holidays,
  salaryStructureId,
}: any) => {
  /**
   * ⚠️ TEMP LOGIC
   * Later nee DB-la irundhu salaryStructure fetch pannalam
   */

  const structure: SalaryStructureCalc = {
    grossSalary: 30000, // example
    earnings: [
      { name: "Basic", percentage: 50 },
      { name: "HRA", percentage: 40 },
      { name: "Special Allowance", percentage: 10 },
    ],
    deductionsEnabled: true,
    deductions: [
      { name: "PF", type: "BASIC_PERCENT", value: 12 },
      { name: "ESI", type: "GROSS_PERCENT", value: 1 },
    ],
  };

  const earnings = calculateEarnings(structure);
  const deductions = calculateDeductionAmounts(structure);
  const totalEarnings = calculateTotalEarnings(structure);
  const totalDeductions = calculateTotalDeductions(structure);
  const netPay = calculateNetPay(structure);

  return {
    grossSalary: structure.grossSalary,
    earnings,
    deductions,
    totalEarnings,
    totalDeductions,
    netPay,
  };
};
