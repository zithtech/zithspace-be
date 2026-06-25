// src/modules/leave-v2/types/index.ts
// Shared domain types + module error class for Leave 2.0.

/** The acting principal for a write, derived from the authenticated request. */
export interface Actor {
  tenantId: string;
  userId: string;
  /** Present when the principal is an employee (needed for self-service leave). */
  employeeId?: string;
}

/** A typed, HTTP-aware error the controller layer maps to a JSON response. */
export class LeaveV2Error extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'LeaveV2Error';
  }

  static notFound(resource: string): LeaveV2Error {
    return new LeaveV2Error(404, 'NOT_FOUND', `${resource} not found`);
  }

  static conflict(message: string): LeaveV2Error {
    return new LeaveV2Error(409, 'CONFLICT', message);
  }

  static badRequest(message: string): LeaveV2Error {
    return new LeaveV2Error(400, 'BAD_REQUEST', message);
  }

  static forbidden(message: string): LeaveV2Error {
    return new LeaveV2Error(403, 'FORBIDDEN', message);
  }
}

export type LeaveUnit = 'day' | 'hour';

export interface LeaveType {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  unit: LeaveUnit;
  isPaid: boolean;
  requiresApproval: boolean;
  color: string | null;
  description: string | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Leave Policy ────────────────────────────────────────────────────────────
export type PolicyScopeType =
  | 'grade'
  | 'department'
  | 'subdepartment'
  | 'position'
  | 'user'
  | 'org';

export interface LeavePolicyAssignment {
  id: string;
  policyId: string;
  scopeType: PolicyScopeType;
  scopeId: string | null;
}

export type TermCycle = 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
export type AccrualMethod = 'monthly' | 'term_total';

/** Months in a term cycle — used to derive the total entitlement per term. */
export const TERM_MONTHS: Record<TermCycle, number> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
};

export interface LeavePolicyLine {
  id: string;
  policyId: string;
  leaveTypeId: string;
  accrualMethod: AccrualMethod;
  countPerPeriod: number;
  /** Derived total per term (monthly → countPerPeriod × months; else countPerPeriod). */
  allocation: number;
  carryForward: boolean;
  carryForwardMax: number | null;
}

export interface LeavePolicy {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  termCycle: TermCycle;
  lopOnExhaustion: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Policy with its assignments + lines (the detail/get shape). */
export interface LeavePolicyDetail extends LeavePolicy {
  assignments: LeavePolicyAssignment[];
  lines: LeavePolicyLine[];
}

/** Policy row for the list view, with counts. */
export interface LeavePolicyListItem extends LeavePolicy {
  assignmentCount: number;
  lineCount: number;
}
