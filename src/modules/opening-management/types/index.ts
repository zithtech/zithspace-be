// src/modules/opening-management/types/index.ts
// Shared domain types + module error class for Opening Management.

/** The acting principal for a write, derived from the authenticated request. */
export interface Actor {
  tenantId: string;
  userId: string;
  /** Present when the principal is an employee. */
  employeeId?: string;
}

/** A typed, HTTP-aware error the controller layer maps to a JSON response. */
export class OpeningError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'OpeningError';
  }

  static notFound(resource: string): OpeningError {
    return new OpeningError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static conflict(message: string): OpeningError {
    return new OpeningError(409, 'CONFLICT', message);
  }

  static badRequest(message: string): OpeningError {
    return new OpeningError(400, 'BAD_REQUEST', message);
  }

  static forbidden(message: string): OpeningError {
    return new OpeningError(403, 'FORBIDDEN', message);
  }
}

// ─── Enumerations (mirror the CHECK constraints in 001_openings.sql) ─────────

export type EmploymentType =
  | 'full_time'
  | 'part_time'
  | 'contract'
  | 'internship'
  | 'freelance';

export type WorkMode = 'remote' | 'hybrid' | 'office';

export type SalaryPeriod = 'hourly' | 'monthly' | 'yearly';

export type OpeningPriority = 'low' | 'medium' | 'high' | 'critical';

export type HiringType = 'replacement' | 'new_position' | 'expansion' | 'backfill';

export type OpeningVisibility = 'internal_only' | 'external_only' | 'both';

/**
 * Full Phase 3 status vocabulary. Phase 1 only ever produces 'draft'; the later
 * phases drive the rest through the approval + posting lifecycle.
 */
export type OpeningStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'internal_posting'
  | 'external_posting'
  | 'in_progress'
  | 'on_hold'
  | 'filled'
  | 'cancelled'
  | 'closed';

export type HiringTeamMemberType =
  | 'hiring_manager'
  | 'technical_panel'
  | 'hr'
  | 'client_interviewer';

// ─── Rows ───────────────────────────────────────────────────────────────────

export interface OpeningRecruiter {
  id: string;
  openingId: string;
  recruiterId: string;
  /** Joined from users; null when the referenced user no longer exists. */
  recruiterName: string | null;
  recruiterEmail: string | null;
  isPrimary: boolean;
  assignedBy: string | null;
  assignedAt: Date;
}

export interface HiringTeamMember {
  id: string;
  openingId: string;
  memberType: HiringTeamMemberType;
  memberId: string | null;
  /** Stored name for external members; joined from users for internal ones. */
  memberName: string | null;
  memberEmail: string | null;
  createdAt: Date;
}

export interface RequiredDocument {
  id: string;
  openingId: string;
  documentName: string;
  isMandatory: boolean;
  notes: string | null;
  createdAt: Date;
}

/** The core opening record, without child collections. */
export interface Opening {
  id: string;
  tenantId: string;
  openingCode: string;

  // Linkage
  clientId: string | null;
  projectId: string | null;
  departmentId: string | null;
  subDepartmentId: string | null;
  hiringManagerId: string | null;
  employmentTypeId: string | null;
  employmentType: EmploymentType;
  workMode: WorkMode;
  locationId: string | null;
  location: string | null;
  numberOfPositions: number;

  // Job details
  jobTitle: string;
  jobDescription: string | null;
  responsibilities: string | null;
  requiredSkills: string[];
  preferredSkills: string[];
  minExperience: number | null;
  maxExperience: number | null;
  education: string | null;
  certifications: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  salaryPeriod: SalaryPeriod;
  budget: number | null;
  noticePeriodDays: number | null;
  shiftTiming: string | null;
  joiningTimeline: string | null;
  targetJoiningDate: string | null;

  // Classification
  priority: OpeningPriority;
  hiringType: HiringType | null;
  visibility: OpeningVisibility;

  status: OpeningStatus;

  // Closure + archive (Phase 7). All null until the opening is closed.
  closureReason: ClosureReason | null;
  closureNote: string | null;
  closedBy: string | null;
  /** Set only when closureReason is 'duplicate_opening'. */
  duplicateOfOpeningId: string | null;
  isArchived: boolean;
  archivedAt: Date | null;
  archivedBy: string | null;

  /** Reason/note for the CURRENT status (Phase 3) — mirrored into history. */
  statusReason: string | null;
  statusNote: string | null;
  statusChangedAt: Date | null;
  closedAt: Date | null;

  // Approval tracking (Phase 2). `approvalRound` is 0 until first submission.
  approvalRound: number;
  submittedAt: Date | null;
  submittedBy: string | null;
  approvedAt: Date | null;

  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * An opening plus the display names resolved from Prisma-owned master tables.
 * Names are LEFT JOINed, so any of them can be null if the referenced row was
 * removed — the module keeps no foreign keys into the Prisma schema.
 */
export interface OpeningWithRefs extends Opening {
  clientName: string | null;
  projectName: string | null;
  departmentName: string | null;
  subDepartmentName: string | null;
  hiringManagerName: string | null;
  employmentTypeName: string | null;
}

/**
 * A list row: the opening plus its recruiters, which the listing UI shows.
 * The heavier hiring-team and document sets are detail-only.
 */
export interface OpeningListItem extends OpeningWithRefs {
  recruiters: OpeningRecruiter[];
}

/** Everything a detail view needs, in one payload. */
export interface OpeningDetail extends OpeningWithRefs {
  recruiters: OpeningRecruiter[];
  hiringTeam: HiringTeamMember[];
  requiredDocuments: RequiredDocument[];
}

// ─── Phase 2: approval workflow ─────────────────────────────────────────────

export type ApproverType =
  | 'hiring_manager'
  | 'department_head'
  | 'role'
  | 'specific_user';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'skipped' | 'cancelled';

/** A tenant-level approval template. */
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

export interface ApprovalWorkflowStep {
  id: string;
  workflowId: string;
  stepOrder: number;
  stepName: string;
  approverType: ApproverType;
  roleId: string | null;
  /** Joined from roles — null if the role was deleted. */
  roleName: string | null;
  specificUserId: string | null;
  specificUserName: string | null;
  fallbackUserId: string | null;
  fallbackUserName: string | null;
  isOptional: boolean;
  slaHours: number | null;
}

export interface ApprovalWorkflowDetail extends ApprovalWorkflow {
  steps: ApprovalWorkflowStep[];
}

export interface ApprovalWorkflowListItem extends ApprovalWorkflow {
  stepCount: number;
}

/**
 * One materialised approval step on an opening. Approver ids here were resolved
 * at submission time and are deliberately frozen — see 002_approvals.sql.
 */
export interface OpeningApproval {
  id: string;
  openingId: string;
  round: number;
  stepOrder: number;
  stepName: string;
  approverType: ApproverType;
  roleId: string | null;
  roleName: string | null;
  approverId: string | null;
  approverName: string | null;
  fallbackUserId: string | null;
  fallbackUserName: string | null;
  isOptional: boolean;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  decidedAsAdmin: boolean;
  slaHours: number | null;
  createdAt: Date;
}

/** The approval trail of an opening, newest round first. */
export interface OpeningApprovalRound {
  round: number;
  steps: OpeningApproval[];
}

/** What every approval action returns: the opening plus its full trail. */
export interface OpeningApprovalState {
  opening: Opening;
  /** The step that can be decided right now; null once the round is finished. */
  currentStep: OpeningApproval | null;
  /** Newest round first. */
  rounds: OpeningApprovalRound[];
}

/** An opening awaiting the caller's decision, with the step that is waiting. */
export interface PendingApprovalItem {
  openingId: string;
  openingCode: string;
  jobTitle: string;
  departmentName: string | null;
  clientName: string | null;
  priority: OpeningPriority;
  numberOfPositions: number;
  submittedAt: Date | null;
  submittedByName: string | null;
  approval: OpeningApproval;
}

// ─── Phase 3: status lifecycle ──────────────────────────────────────────────

/** One append-only entry in an opening's status timeline. */
export interface StatusHistoryEntry {
  id: string;
  openingId: string;
  fromStatus: OpeningStatus | null;
  toStatus: OpeningStatus;
  reason: string | null;
  note: string | null;
  isAutomated: boolean;
  changedBy: string | null;
  changedByName: string | null;
  changedAt: Date;
}

/** A move the caller may make from the opening's current status, right now. */
export interface AllowedTransition {
  to: OpeningStatus;
  label: string;
  /** True when a note must accompany the move. */
  requiresNote: boolean;
  /** True when this move needs `opening.manage`. */
  requiresManage: boolean;
}

/** Current status + what can be done next + how it got here. */
export interface OpeningStatusState {
  openingId: string;
  openingCode: string;
  status: OpeningStatus;
  statusReason: string | null;
  statusNote: string | null;
  statusChangedAt: Date | null;
  closedAt: Date | null;
  /** Filtered to what THIS caller may do (permissions already applied). */
  allowedTransitions: AllowedTransition[];
  history: StatusHistoryEntry[];
}

// ─── Phase 4: posting lifecycle ─────────────────────────────────────────────

export type PostingType = 'internal' | 'external';
export type PostingStatus = 'active' | 'expired' | 'closed';

/** Tenant-level posting configuration. */
export interface PostingSettings {
  tenantId: string;
  /** Length of the internal-only window, in days. The spec's default is 15. */
  internalPostingDays: number;
  /** Tenant-wide switch for the scheduled internal → external move. */
  autoMoveToExternal: boolean;
  updatedBy: string | null;
  updatedAt: Date | null;
}

/** One posting event on an opening. */
export interface OpeningPosting {
  id: string;
  openingId: string;
  postingType: PostingType;
  status: PostingStatus;
  postedAt: Date;
  /** Internal postings only — when the window closes. */
  expiresAt: Date | null;
  autoMove: boolean;
  movedAt: Date | null;
  closedAt: Date | null;
  closedReason: string | null;
  postedBy: string | null;
  postedByName: string | null;
  isAutomated: boolean;
  /** Whole days left in the window; null for external or finished postings. */
  daysRemaining: number | null;
}

/** What the auto-move sweep did, for logs and the manual-trigger endpoint. */
export interface AutoMoveResult {
  scanned: number;
  moved: number;
  failed: { openingId: string; error: string }[];
}

// ─── Phase 5: candidate intake ──────────────────────────────────────────────

/** Where a candidate came from. Mirrors the CHECK in 006_applications.sql. */
export type IntakeSource =
  | 'careers_page'
  | 'employee_referral'
  | 'internal_transfer'
  | 'internal_job_posting'
  | 'recruitment_agency'
  | 'linkedin'
  | 'naukri'
  | 'indeed'
  | 'manual_upload'
  | 'campus_hiring'
  | 'other';

export type ApplicationStage =
  | 'applied'
  | 'screening'
  | 'shortlisted'
  | 'interview'
  | 'offer'
  | 'hired'
  | 'rejected'
  | 'withdrawn'
  | 'on_hold';

/**
 * One candidate's application to one opening. Candidate master data is joined
 * from the platform's `candidates` table, never copied — the `candidate*` fields
 * below are read-only projections.
 */
export interface OpeningApplication {
  id: string;
  openingId: string;
  candidateId: string;
  /** Which candidate store this application points at (see migration 009). */
  candidateSource: 'ats' | 'pipeline';

  // Joined from `candidates`; null if the candidate row was removed.
  candidateName: string | null;
  candidateEmail: string | null;
  candidatePhone: string | null;
  candidateCurrentRole: string | null;
  candidateExperience: number | null;
  candidateSkills: string[];

  source: IntakeSource;
  sourceDetail: string | null;
  referredBy: string | null;
  referredByName: string | null;

  stage: ApplicationStage;
  stageChangedAt: Date;
  rejectionReason: string | null;

  appliedAt: Date;
  /** The CV submitted for THIS opening, which may differ from the master one. */
  resumeUrl: string | null;
  notes: string | null;

  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApplicationStageHistoryEntry {
  id: string;
  applicationId: string;
  fromStage: ApplicationStage | null;
  toStage: ApplicationStage;
  note: string | null;
  changedBy: string | null;
  changedByName: string | null;
  changedAt: Date;
}

export interface ApplicationDetail extends OpeningApplication {
  history: ApplicationStageHistoryEntry[];
}

/**
 * The funnel for one opening. Counts are cumulative in the sense the dashboard
 * means them: someone at `offer` was also screened and interviewed.
 */
export interface ApplicationFunnel {
  openPositions: number;
  applications: number;
  screened: number;
  interview: number;
  offers: number;
  joined: number;
  rejected: number;
  withdrawn: number;
  /** Live counts per stage, for a pipeline board. */
  byStage: Record<string, number>;
  bySource: Record<string, number>;
}

/** Returned after a stage move so the caller knows whether hiring is done. */
export interface StageChangeResult {
  application: ApplicationDetail;
  /** hired count ≥ numberOfPositions — the UI can prompt to close the opening. */
  positionsFilled: boolean;
  hiredCount: number;
  openPositions: number;
  /** Set when the move also advanced the opening's own status. */
  openingStatusChangedTo: OpeningStatus | null;
}

// ─── Phase 6: hiring dashboard ──────────────────────────────────────────────

/** One row of the dashboard: an opening with its live funnel. */
export interface OpeningMetrics {
  openingId: string;
  openingCode: string;
  jobTitle: string;
  status: OpeningStatus;
  priority: OpeningPriority;
  departmentName: string | null;
  clientName: string | null;
  hiringManagerName: string | null;
  primaryRecruiterName: string | null;

  /** Positions requested on the opening. */
  openPositions: number;
  /** Still to fill: positions − joined, floored at zero. */
  remainingPositions: number;

  applications: number;
  screened: number;
  interview: number;
  offers: number;
  joined: number;
  rejected: number;
  withdrawn: number;

  /** Days since the opening was created. */
  ageDays: number;
  /** Days since it was first posted; null if never posted. */
  daysSincePosted: number | null;
  /** Mean days from application to hire, for this opening's hires. */
  avgDaysToHire: number | null;
}

/** Tenant-wide totals across whatever the filter selected. */
export interface DashboardSummary {
  openings: number;
  openPositions: number;
  remainingPositions: number;
  applications: number;
  screened: number;
  interview: number;
  offers: number;
  joined: number;
  rejected: number;
  withdrawn: number;
  openingsByStatus: Record<string, number>;
  openingsByPriority: Record<string, number>;
  /** Mean days from application to hire across the selection. */
  avgDaysToHire: number | null;
  /** Offers made ÷ offers accepted, as a percentage. Null when no offers. */
  offerAcceptanceRate: number | null;
}

/** How well each intake channel actually performs. */
export interface SourceEffectiveness {
  source: IntakeSource;
  applications: number;
  interview: number;
  offers: number;
  joined: number;
  rejected: number;
  /** hired ÷ applications, as a percentage. */
  conversionRate: number;
}

/** Mean time an application spends in each stage before moving on. */
export interface StageVelocity {
  stage: ApplicationStage;
  /** Applications that have LEFT this stage — the only ones that can be timed. */
  transitions: number;
  avgDays: number;
}

export interface RecruiterLoad {
  recruiterId: string;
  recruiterName: string | null;
  openings: number;
  activeOpenings: number;
  applications: number;
  joined: number;
}

// ─── Phase 7: closing and archiving ─────────────────────────────────────────

/** Why recruitment stopped. Mirrors the CHECK in 007_closure.sql. */
export type ClosureReason =
  | 'position_filled'
  | 'cancelled'
  | 'budget_issue'
  | 'client_cancelled'
  | 'duplicate_opening';

/** What closing an opening did. */
export interface ClosureResult {
  opening: Opening;
  /** The terminal status the reason mapped to. */
  status: OpeningStatus;
  archived: boolean;
  /** Live job postings taken down as part of closing. */
  postingsClosed: number;
  /** Candidates still in play when it closed. */
  openApplications: number;
  /** How many of those were bulk-rejected, when the caller asked for it. */
  applicationsRejected: number;
}

/** An opening that has met its hiring target but is still open. */
export interface ClosureCandidate {
  openingId: string;
  openingCode: string;
  jobTitle: string;
  status: OpeningStatus;
  openPositions: number;
  hired: number;
  /** Candidates still in the pipeline who would be left behind. */
  openApplications: number;
  departmentName: string | null;
  hiringManagerName: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Referrals ─────────────────────────────────────────────────────────────

export interface OpeningReferral {
  id: string;
  openingId: string;
  referredBy: string;
  name: string;
  email: string;
  mobile: string;
  resumeUrl?: string | null;
  notes?: string | null;
  skills: string[];
  totalExperience: number;
  status: 'pending' | 'converted' | 'rejected';
  createdAt: string;
}

export interface CreateReferralInput {
  name: string;
  email: string;
  mobile: string;
  resumeUrl?: string | null;
  notes?: string | null;
  skills?: string[];
  totalExperience?: number;
}
