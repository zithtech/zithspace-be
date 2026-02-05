import { Company } from "@/types/salary";

/* =======================
   INTERNAL CALC TYPE
======================= */

export interface SalaryStructureCalc {
  grossSalary: number;
  earnings: {
    name: string;
    percentage: number;
  }[];
  deductions: {
    name: string;
    type: "BASIC_PERCENT" | "GROSS_PERCENT" | "FIXED";
    value: number;
  }[];
  deductionsEnabled: boolean;
}

/* =======================
   CORE CALCULATIONS
======================= */

export const calculateEarnings = (structure: SalaryStructureCalc) => {
  return structure.earnings.map(e => ({
    ...e,
    amount: Math.round((structure.grossSalary * e.percentage) / 100),
  }));
};

export const getBasicPay = (structure: SalaryStructureCalc): number => {
  const earnings = calculateEarnings(structure);
  return earnings.find(e => e.name.toLowerCase().includes("basic"))?.amount || 0;
};

export const calculateDeductionAmounts = (structure: SalaryStructureCalc) => {
  if (!structure.deductionsEnabled) return [];

  const basicPay = getBasicPay(structure);

  return structure.deductions.map(d => {
    let amount = 0;

    switch (d.type) {
      case "BASIC_PERCENT":
        amount = Math.round((basicPay * d.value) / 100);
        break;
      case "GROSS_PERCENT":
        amount = Math.round((structure.grossSalary * d.value) / 100);
        break;
      case "FIXED":
        amount = d.value;
        break;
    }

    return { ...d, amount };
  });
};

export const calculateTotalEarnings = (structure: SalaryStructureCalc) =>
  calculateEarnings(structure).reduce((sum, e) => sum + e.amount, 0);

export const calculateTotalDeductions = (structure: SalaryStructureCalc) =>
  structure.deductionsEnabled
    ? calculateDeductionAmounts(structure).reduce((sum, d) => sum + d.amount, 0)
    : 0;

export const calculateNetPay = (structure: SalaryStructureCalc) =>
  structure.grossSalary - calculateTotalDeductions(structure);

/* =======================
   FINANCIAL YEAR LOGIC
======================= */

export const getFinancialYearMonthIndex = (date: string): number => {
  const d = new Date(date);
  const month = d.getMonth() + 1;
  return month >= 4 ? month - 3 : month + 9;
};

/* =======================
   YTD CALCULATIONS
======================= */

export const calculateEarningsWithYTD = (
  structure: SalaryStructureCalc,
  fromDate: string
) => {
  const idx = getFinancialYearMonthIndex(fromDate);
  return calculateEarnings(structure).map(e => ({
    ...e,
    ytd: e.amount * idx,
  }));
};

export const calculateDeductionsWithYTD = (
  structure: SalaryStructureCalc,
  fromDate: string
) => {
  const idx = getFinancialYearMonthIndex(fromDate);
  return calculateDeductionAmounts(structure).map(d => ({
    ...d,
    ytd: d.amount * idx,
  }));
};

export const calculateTotalEarningsYTD = (
  structure: SalaryStructureCalc,
  fromDate: string
) =>
  calculateEarningsWithYTD(structure, fromDate)
    .reduce((sum, e) => sum + e.ytd, 0);

export const calculateTotalDeductionsYTD = (
  structure: SalaryStructureCalc,
  fromDate: string
) =>
  structure.deductionsEnabled
    ? calculateDeductionsWithYTD(structure, fromDate)
        .reduce((sum, d) => sum + d.ytd, 0)
    : 0;

/* =======================
   FORMATTERS
======================= */

export const formatDate = (dateStr: string): string => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1
  ).padStart(2, "0")}/${d.getFullYear()}`;
};

export const formatMonthYear = (dateStr: string): string => {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString("en-IN", {
    month: "short",
    year: "numeric",
  });
};

export const formatCompanyAddress = (company: Company): string[] => {
  const lines: string[] = [];

  const l1 = [company.plotNo, company.floorNo, company.buildingName]
    .filter(Boolean)
    .join(", ");
  if (l1) lines.push(l1);

  const l2 = [company.street, company.area].filter(Boolean).join(", ");
  if (l2) lines.push(l2);

  const l3 = [company.city, company.pincode, company.country]
    .filter(Boolean)
    .join(" ");
  if (l3) lines.push(l3);

  return lines;
};

/* =======================
   NUMBER TO WORDS (INR)
======================= */

export const numberToWords = (num: number): string => {
  if (!num) return "Zero Rupees Only";

  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six",
    "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
    "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];

  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const convert = (n: number): string => {
    if (n < 20) return ones[n];
    if (n < 100) return `${tens[Math.floor(n / 10)]} ${ones[n % 10]}`;
    return `${ones[Math.floor(n / 100)]} Hundred ${convert(n % 100)}`;
  };

  let result = "";
  let n = num;

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;

  if (crore) result += `${convert(crore)} Crore `;
  if (lakh) result += `${convert(lakh)} Lakh `;
  if (thousand) result += `${convert(thousand)} Thousand `;
  if (n) result += convert(n);

  return `${result.trim()} Rupees Only`;
};
