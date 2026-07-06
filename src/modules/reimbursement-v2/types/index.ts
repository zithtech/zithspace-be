// src/modules/reimbursement-v2/types/index.ts
// Shared domain types + module error class for Reimbursement 2.0.

/** The acting principal for a write, derived from the authenticated request. */
export interface Actor {
  tenantId: string;
  userId: string;
  /** Present when the principal is an employee (self-service claims). */
  employeeId?: string;
}

/** A typed, HTTP-aware error the controller layer maps to a JSON response. */
export class ReimbursementV2Error extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ReimbursementV2Error';
  }

  static notFound(resource: string): ReimbursementV2Error {
    return new ReimbursementV2Error(404, 'NOT_FOUND', `${resource} not found`);
  }

  static conflict(message: string): ReimbursementV2Error {
    return new ReimbursementV2Error(409, 'CONFLICT', message);
  }

  static badRequest(message: string): ReimbursementV2Error {
    return new ReimbursementV2Error(400, 'BAD_REQUEST', message);
  }

  static forbidden(message: string): ReimbursementV2Error {
    return new ReimbursementV2Error(403, 'FORBIDDEN', message);
  }
}

// ─── Expense Category ────────────────────────────────────────────────────────
/** 'amount' = normal money expense; 'mileage' = distance × rate. */
export type CategoryKind = 'amount' | 'mileage';

export interface ExpenseCategory {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description: string | null;
  /** General-ledger / accounting code for finance export. */
  glCode: string | null;
  /** Discriminator: normal amount vs distance-based mileage category. */
  kind: CategoryKind;
  /** Base-currency amount per distance unit (mileage categories only). */
  mileageRate: number | null;
  /** Distance unit label for mileage categories, e.g. 'km' / 'mile'. */
  mileageUnit: string | null;
  /** Hard limit for a single line item in this category (null = unlimited). */
  maxPerClaim: number | null;
  monthlyLimit: number | null;
  yearlyLimit: number | null;
  perDayLimit: number | null;
  /** When true, every claim item in this category needs at least one receipt. */
  receiptRequired: boolean;
  /** Softer rule: require a receipt only when the amount exceeds this threshold. */
  receiptRequiredAbove: number | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Reimbursement Policy ────────────────────────────────────────────────────
export type PolicyScopeType =
  | 'grade'
  | 'department'
  | 'subdepartment'
  | 'position'
  | 'location'
  | 'user'
  | 'org';

export interface PolicyAssignment {
  id: string;
  policyId: string;
  scopeType: PolicyScopeType;
  scopeId: string | null;
}

/** Per-category limit override inside a policy. */
export interface PolicyLine {
  id: string;
  policyId: string;
  categoryId: string;
  maxPerClaim: number | null;
  monthlyLimit: number | null;
  yearlyLimit: number | null;
  perDayLimit: number | null;
}

export interface ReimbursementPolicy {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description: string | null;
  /** Claims with a total at or below this amount skip approval (0/null = off). */
  autoApproveBelow: number | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Policy with its assignments + lines (the detail/get shape). */
export interface ReimbursementPolicyDetail extends ReimbursementPolicy {
  assignments: PolicyAssignment[];
  lines: PolicyLine[];
}

/** Policy row for the list view, with counts. */
export interface ReimbursementPolicyListItem extends ReimbursementPolicy {
  assignmentCount: number;
  lineCount: number;
}

// ─── Claims ──────────────────────────────────────────────────────────────────
export type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'paid'
  | 'cancelled';

export interface ClaimItem {
  id: string;
  tenantId: string;
  claimId: string;
  categoryId: string;
  /** Category name/code hydrated for display (from a JOIN). */
  categoryName?: string | null;
  categoryCode?: string | null;
  expenseDate: string; // YYYY-MM-DD
  merchant: string | null;
  billNo: string | null;
  amount: number;
  taxAmount: number;
  /** Distance for mileage items; amount is derived = distance × category rate. */
  distance: number | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClaimAttachment {
  id: string;
  tenantId: string;
  claimId: string;
  claimItemId: string | null;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  fileType: string | null;
  uploadedBy: string | null;
  uploadedAt: Date;
}

export interface Claim {
  id: string;
  tenantId: string;
  userId: string;
  claimNo: string;
  title: string | null;
  status: ClaimStatus;
  totalAmount: number;
  currency: string;
  /** Rate from claim currency → base currency (1 when same). */
  exchangeRate: number;
  baseCurrency: string;
  /** totalAmount × exchangeRate, in base currency (for finance/reports). */
  baseAmount: number;
  submittedAt: Date | null;
  approverId: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  paidAt: Date | null;
  paidBy: string | null;
  paymentReference: string | null;
  /** Optional advance this claim reconciles against. */
  advanceId: string | null;
  /** Optional cost-allocation tags (drive project / department budgets). */
  projectId: string | null;
  departmentId: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Claim header with its items + attachments (detail/get shape). */
export interface ClaimDetail extends Claim {
  items: ClaimItem[];
  attachments: ClaimAttachment[];
}

/** A row in the manager approval inbox — a claim plus the requester's identity. */
export interface ApprovalInboxItem extends Claim {
  requesterName: string | null;
  requesterEmail: string | null;
  itemCount: number;
}

// ─── Advances ────────────────────────────────────────────────────────────────
export type AdvanceStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'paid'
  | 'partially_reconciled'
  | 'reconciled'
  | 'cancelled';

export interface Advance {
  id: string;
  tenantId: string;
  userId: string;
  advanceNo: string;
  purpose: string | null;
  amount: number;
  currency: string;
  neededBy: string | null;
  status: AdvanceStatus;
  approverId: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  paidAt: Date | null;
  paidBy: string | null;
  paymentReference: string | null;
  reconciledAmount: number;
  /** amount − reconciledAmount (never below 0). */
  outstanding: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Advance row for a manager/finance queue, with the requester's identity. */
export interface AdvanceInboxItem extends Advance {
  requesterName: string | null;
  requesterEmail: string | null;
}

export type ApprovalAction =
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'sent_back'
  | 'paid'
  | 'cancelled';

export interface ClaimApprovalEntry {
  id: string;
  claimId: string;
  actorId: string;
  action: ApprovalAction;
  remarks: string | null;
  createdAt: Date;
}

// ─── Budgets ─────────────────────────────────────────────────────────────────
export type BudgetScopeType = 'org' | 'department' | 'project' | 'category' | 'user';

export interface Budget {
  id: string;
  tenantId: string;
  name: string;
  scopeType: BudgetScopeType;
  scopeId: string | null;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  amount: number;
  currency: string;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Budget with derived spend figures (base currency). */
export interface BudgetWithSpend extends Budget {
  spent: number;
  remaining: number;
  /** spent / amount as a 0–1 fraction (rounded to 4 dp). */
  utilization: number;
}
