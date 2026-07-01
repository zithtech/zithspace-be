// src/modules/payroll/types/index.ts
// Shared domain types + module error class for the Payroll 2.0 module.

/** The acting principal for a write, derived from the authenticated request. */
export interface Actor {
  tenantId: string;
  userId: string;
  employeeId?: string;
}

/** A typed, HTTP-aware error the controller layer maps to a JSON response. */
export class PayrollError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'PayrollError';
  }

  static notFound(resource: string): PayrollError {
    return new PayrollError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static conflict(message: string): PayrollError {
    return new PayrollError(409, 'CONFLICT', message);
  }

  static badRequest(message: string): PayrollError {
    return new PayrollError(400, 'BAD_REQUEST', message);
  }

  static forbidden(message: string): PayrollError {
    return new PayrollError(403, 'FORBIDDEN', message);
  }
}

// ─── General Settings shapes ─────────────────────────────────────────────────
export type SalaryCalcBasis = 'calendar_days' | 'fixed_days' | 'working_days';
export type PayFrequency = 'monthly' | 'semi_monthly' | 'weekly' | 'biweekly';
export type RoundingMode = 'none' | 'nearest' | 'up' | 'down';

export interface PayrollSettings {
  id: string;
  tenantId: string;
  financialYearStartMonth: number;
  currency: string;
  payFrequency: PayFrequency;
  salaryCalcBasis: SalaryCalcBasis;
  salaryFixedDays: number;
  lopCalcBasis: SalaryCalcBasis;
  lopFixedDays: number;
  roundingMode: RoundingMode;
  roundingNearest: number;
  decimalPlaces: number;
  payDay: number;
  enableLop: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Salary Component shapes ─────────────────────────────────────────────────
export type ComponentCategory = 'earning' | 'deduction' | 'reimbursement' | 'benefit';
export type ComponentCalcType = 'fixed' | 'percentage' | 'formula';
export type ComponentPercentageOf = 'gross' | 'basic' | 'ctc';

export interface PayComponent {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  category: ComponentCategory;
  calculationType: ComponentCalcType;
  percentageOf: ComponentPercentageOf | null;
  defaultValue: number | null;
  isTaxable: boolean;
  isProRata: boolean;
  partOfCtc: boolean;
  considerForPf: boolean;
  considerForEsi: boolean;
  showOnPayslip: boolean;
  displayOrder: number;
  description: string | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Salary Structure shapes ─────────────────────────────────────────────────
export type StructureCalcType = 'fixed' | 'percentage';

export interface PayStructure {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description: string | null;
  monthlyCtc: number;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayStructureListItem extends PayStructure {
  componentCount: number;
}

/** A structure line enriched with the underlying component's meta + preview amount. */
export interface PayStructureLine {
  id: string;
  structureId: string;
  componentId: string;
  // From pay_components (read-only meta).
  code: string;
  name: string;
  category: ComponentCategory;
  // This grade's calculation rule.
  calculationType: StructureCalcType;
  percentageOf: ComponentPercentageOf | null;
  value: number;
  displayOrder: number;
  // Computed against monthly_ctc (not stored).
  calculatedAmount: number;
}

export interface StructureTotals {
  totalEarnings: number;
  totalDeductions: number;
  totalBenefits: number;
  grossSalary: number;
  netSalary: number;
  ctc: number;
  balanced: boolean;
  warning?: string;
}

export interface PayStructureDetail extends PayStructure {
  lines: PayStructureLine[];
  totals: StructureTotals;
}

// ─── Pay Schedule shapes ─────────────────────────────────────────────────────
export interface PaySchedule {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  frequency: PayFrequency;
  cycleStartDay: number;
  cycleEndDay: number;
  payDay: number;
  payInNextMonth: boolean;
  isDefault: boolean;
  description: string | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayScheduleListItem extends PaySchedule {
  groupCount: number;
}

// ─── Pay Group shapes ────────────────────────────────────────────────────────
export interface PayGroup {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  scheduleId: string;
  legalEntity: string | null;
  description: string | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayGroupListItem extends PayGroup {
  scheduleName: string | null;
  scheduleCode: string | null;
}

// ─── Statutory: PF & ESI shapes ──────────────────────────────────────────────
export interface PfConfig {
  id: string;
  tenantId: string;
  enabled: boolean;
  employeeRate: number;
  employerRate: number;
  wageCeiling: number;
  restrictToCeiling: boolean;
  includeEmployerInCtc: boolean;
  epsEnabled: boolean;
  epsRate: number;
  edliEnabled: boolean;
  edliRate: number;
  adminChargesRate: number;
  establishmentCode: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EsiConfig {
  id: string;
  tenantId: string;
  enabled: boolean;
  employeeRate: number;
  employerRate: number;
  wageThreshold: number;
  establishmentCode: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Professional Tax (state slabs) shapes ───────────────────────────────────
export interface PtSlab {
  id: string;
  ptStateId: string;
  fromAmount: number;
  toAmount: number | null;
  monthlyAmount: number;
  displayOrder: number;
}

export interface PtState {
  id: string;
  tenantId: string;
  state: string;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PtStateListItem extends PtState {
  slabCount: number;
}

export interface PtStateDetail extends PtState {
  slabs: PtSlab[];
}

// ─── Payslip Template & Bank Settings shapes ─────────────────────────────────
export type PayslipTemplateStyle = 'modern' | 'classic' | 'minimal';

export interface PayslipTemplate {
  id: string;
  tenantId: string;
  templateStyle: PayslipTemplateStyle;
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
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PaymentMode = 'neft' | 'imps' | 'rtgs';
export type BankFileFormat = 'generic_csv' | 'hdfc' | 'icici' | 'sbi' | 'axis' | 'kotak';

export interface BankSettings {
  id: string;
  tenantId: string;
  companyBankName: string | null;
  companyAccountNumber: string | null;
  companyIfsc: string | null;
  paymentMode: PaymentMode;
  bankFileFormat: BankFileFormat;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Employee Salary Assignment shapes ───────────────────────────────────────
export interface EmployeeAssignment {
  id: string;
  tenantId: string;
  employeeId: string;
  structureId: string;
  monthlyCtc: number;
  annualCtc: number;
  effectiveFrom: string; // YYYY-MM-DD
  isActive: boolean;
  notes: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmployeeAssignmentComponent {
  id: string;
  assignmentId: string;
  componentId: string;
  code: string;
  name: string;
  category: ComponentCategory;
  calculationType: StructureCalcType;
  percentageOf: ComponentPercentageOf | null;
  value: number;
  calculatedAmount: number;
  displayOrder: number;
}

export interface EmployeeAssignmentListItem extends EmployeeAssignment {
  structureName: string | null;
  structureCode: string | null;
}

export interface EmployeeAssignmentDetail extends EmployeeAssignmentListItem {
  components: EmployeeAssignmentComponent[];
  totals: StructureTotals;
}

// ─── Pay Run shapes ──────────────────────────────────────────────────────────
export type PayRunStatus = 'draft' | 'pending_approval' | 'approved' | 'finalized' | 'paid' | 'cancelled';

export interface PayRunLine {
  componentId: string;
  code: string;
  name: string;
  category: ComponentCategory;
  isProRata: boolean;
  fullAmount: number;
  amount: number;
}

export interface PayRun {
  id: string;
  tenantId: string;
  payGroupId: string | null;
  payGroupName: string;
  month: number;
  year: number;
  periodLabel: string;
  status: PayRunStatus;
  totalDays: number;
  employeeCount: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  workflowId: string | null;
  workflowName: string | null;
  currentStep: number;
  totalSteps: number;
  notes: string | null;
  finalizedAt: Date | null;
  paidAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayRunApproval {
  id: string;
  runId: string;
  stepNumber: number;
  action: 'submitted' | 'approved' | 'rejected' | 'finalized' | 'paid';
  performedBy: string | null;
  remarks: string | null;
  createdAt: Date;
}

export interface PayRunItem {
  id: string;
  runId: string;
  employeeId: string;
  assignmentId: string | null;
  structureName: string | null;
  monthlyCtc: number;
  totalDays: number;
  lopDays: number;
  paidDays: number;
  gross: number;
  totalDeductions: number;
  net: number;
  lopDeduction: number;
  components: PayRunLine[];
  notes: string | null;
}

export interface PayRunDetail extends PayRun {
  items: PayRunItem[];
  approvals: PayRunApproval[];
}

// ─── Payslip shapes ──────────────────────────────────────────────────────────
export interface PayPayslip {
  id: string;
  tenantId: string;
  runId: string;
  employeeId: string;
  month: number;
  year: number;
  periodLabel: string;
  gross: number;
  totalDeductions: number;
  net: number;
  lopDays: number;
  fileUrl: string;
  fileKey: string | null;
  status: string;
  generatedBy: string | null;
  generatedAt: Date;
}

export interface EmployeeBasicInfo {
  id: string;
  name: string;
  email: string | null;
  designation: string | null;
  employeeCode: string | null;
  department: string | null;
  grade: string | null;
  location: string | null;
  dateOfJoining: string | null; // YYYY-MM-DD
}

export interface PayBankFile {
  id: string;
  tenantId: string;
  runId: string;
  month: number;
  year: number;
  periodLabel: string;
  format: BankFileFormat;
  paymentMode: PaymentMode;
  employeeCount: number;
  totalAmount: number;
  skippedCount: number;
  fileUrl: string;
  fileKey: string | null;
  generatedBy: string | null;
  generatedAt: Date;
}

// ─── Employee Statutory & Bank Profile shapes ────────────────────────────────
export type TaxRegime = 'old' | 'new';

export interface EmployeeProfile {
  id: string;
  tenantId: string;
  employeeId: string;
  pan: string | null;
  uan: string | null;
  pfNumber: string | null;
  esiNumber: string | null;
  taxRegime: TaxRegime;
  accountHolderName: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Approval Workflow shapes ────────────────────────────────────────────────
export type ApproverType = 'manager' | 'role' | 'specific_user';

export interface ApprovalStep {
  id: string;
  workflowId: string;
  stepOrder: number;
  approverType: ApproverType;
  roleId: string | null;
  specificUserId: string | null;
  fallbackUserId: string | null;
}

export interface ApprovalWorkflow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApprovalWorkflowListItem extends ApprovalWorkflow {
  stepCount: number;
}

export interface ApprovalWorkflowDetail extends ApprovalWorkflow {
  steps: ApprovalStep[];
}

// ─── LWF (per state) shapes ──────────────────────────────────────────────────
export type LwfFrequency = 'monthly' | 'half_yearly' | 'yearly';

export interface LwfState {
  id: string;
  tenantId: string;
  state: string;
  employeeAmount: number;
  employerAmount: number;
  frequency: LwfFrequency;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}
