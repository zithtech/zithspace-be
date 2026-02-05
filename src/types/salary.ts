/* =======================
   CORE EMPLOYEE & COMPANY
======================= */

export interface Employee {
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  doj: string;
  grade?: string;
  location?: string;
  pan?: string;
  pfNo?: string;
  esiNo?: string;
  uanNo?: string;
  bankName?: string;
  accountNo?: string;
  email?: string;
  phone?: string;
}

export interface Company {
  id: number; 
  name: string;
  logo?: string;
  plotNo?: string;
  floorNo?: string;
  buildingName?: string;
  street?: string;
  area?: string;
  city?: string;
  pincode?: string;
  country?: string;
  cin?: string;
  gst?: string;
  phone?: string;
  email?: string;
}

/* =======================
   SALARY STRUCTURE
======================= */

export type DeductionType = "BASIC_PERCENT" | "GROSS_PERCENT" | "FIXED";

export interface Earning {
  id?: number;
  name: string;
  percentage: number;
  description?: string;
}

export interface Deduction {
  id?: number;
  name: string;
  type: DeductionType;
  value: number;
  description?: string;
}

export interface EmployeeSalary {
  employeeId: string;
  grossSalary: number;
  deductionsEnabled: boolean;
  earnings: Earning[];
  deductions: Deduction[];
}

/* =======================
   ATTENDANCE
======================= */

export interface AttendanceResponse {
  calendarDays: number;
  standardDays: number;
  workedDays: number;
  paidDays: number;
  lopDays: number;
  holidays: number;
  weeklyOffs: number;
  leaves: Record<string, number>;
  overtime?: {
    hours: number;
    unit: string;
  };
}

export const ATTENDANCE_LABELS: Record<string, string> = {
  calendarDays: "Calendar Days",
  standardDays: "Standard Days",
  workedDays: "Worked Days",
  paidDays: "Paid Days",
  lopDays: "LOP Days",
  holidays: "Holidays",
  weeklyOffs: "Weekly Offs",
};

export const LEAVE_LABELS: Record<string, string> = {
  cl: "Casual Leave",
  sl: "Sick Leave",
  pl: "Privilege Leave",
};

/* =======================
   REIMBURSEMENTS
======================= */

export interface ReimbursementItem {
  amount: number;
  ytd: number;
}

export interface ReimbursementResponse {
  reimbursements: Record<string, ReimbursementItem>;
  total: number;
}

export const REIMBURSEMENT_LABELS: Record<string, string> = {
  travel: "Travel",
  internet: "Internet",
  mobile: "Mobile",
  fuel: "Fuel",
};

/* =======================
   PAYSLIP DATA
======================= */

export interface PayslipData {
  employee: Employee;
  company: Company;
  salaryStructure: EmployeeSalary;
  fromDate: string;
  toDate: string;
  attendance?: AttendanceResponse | null;
  reimbursements?: ReimbursementResponse | null;
}
