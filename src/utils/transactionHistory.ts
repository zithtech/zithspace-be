import { Request } from "express";
import pool from "@/config/dbpool";
import { AuthRequest } from "@/types";
import { socketService } from "@/services/socketService";

// ===== Taxonomy =====
// Section / Module / Page constants are declared here so they stay stable when
// routes change. Controllers reference these constants — never raw req.path.

export const Section = {
  HOME: "HOME",
  WORK: "WORK",
  HR: "HR",
  FINANCE: "FINANCE",
  SETTINGS: "SETTINGS",
  CLIENT_PORTAL: "CLIENT_PORTAL",
  ADMIN: "ADMIN",
} as const;
export type SectionT = typeof Section[keyof typeof Section];

export const Module = {
  DASHBOARD: "Dashboard",
  INTEGRATIONS: "Integrations",
  SKILLS: "Skills",
  MESSAGES: "Messages",
  BOOKMARKS: "Bookmarks",
  // WORK
  TICKETS: "Tickets",
  BUG_LIST: "BugList",
  PROJECTS: "Projects",
  SPRINTS: "Sprints",
  BUCKETS: "Buckets",
  TICKET_SETTINGS: "TicketSettings",
  TRASH: "Trash",
  ARCHIVED: "Archived",
  DOCUMENT_HUB: "DocumentHub",
  LEADS: "Leads",
  BID_IQ: "BidIQ",
  PROPOSALS: "Proposals",
  SQUAD: "Squad",
  ESCALATIONS: "Escalations",
  DAILY_UPDATES: "DailyUpdates",
  TIME_TRACKING: "TimeTracking",
  ORG_STRUCTURE: "OrgStructure",
  // HR
  LEAVES: "Leaves",
  ONBOARDING: "Onboarding",
  REIMBURSEMENT: "Reimbursement",
  MY_PROFILE: "MyProfile",
  ATTENDANCE: "Attendance",
  PERFORMANCE_REPORT: "PerformanceReport",
  // FINANCE
  ACCOUNTS: "Accounts",
  INVOICES: "Invoices",
  INVOICE_CUSTOMERS: "InvoiceCustomers",
  INVOICE_SETTINGS: "InvoiceSettings",
  INVOICE_TEMPLATES: "InvoiceTemplates",
  INVOICE_TRASH: "InvoiceTrash",
  REIMBURSEMENT_V2: "ReimbursementV2",
  PAYROLL_V2: "PayrollV2",
  // ADMIN
  CLIENTS_V2: "ClientsV2",
  GENERAL_SETTINGS: "GeneralSettings",
  MEMBERS: "Members",
  ROLE_AND_PERMISSIONS: "RoleAndPermissions",
  AUTH: "Auth",
} as const;
export type ModuleT = typeof Module[keyof typeof Module];

export const Page = {
  DASHBOARD_SETTINGS: "DashboardSettings",
  INTEGRATION_PAGE: "IntegrationPage",
  INTEGRATION_MAIL: "IntegrationMail",
  INTEGRATION_CALENDAR: "IntegrationCalendar",
  SKILLS_VIEW: "SkillsView",
  MESSAGES_VIEW: "MessagesView",
  BOOKMARKS_VIEW: "BookmarksView",
  // Tickets module
  TICKET_LIST: "TicketList",
  TICKET_DETAIL: "TicketDetail",
  TICKET_KANBAN: "TicketKanban",
  TICKET_EPIC: "TicketEpic",
  // BugList module
  BUG_FOLDER_LIST: "BugFolderList",
  BUG_SHEET_LIST: "BugSheetList",
  BUG_LIST: "BugList",
  BUG_SETTINGS: "BugSettings",
  BUG_TRASH: "BugTrash",
  // Projects module
  PROJECT_LIST: "ProjectList",
  PROJECT_DETAIL: "ProjectDetail",
  PROJECT_TRASH: "ProjectTrash",
  // Sprints module
  SPRINT_LIST: "SprintList",
  SPRINT_DETAIL: "SprintDetail",
  SPRINT_COMPLETION: "SprintCompletion",
  SPRINT_REPORT: "SprintReport",
  // Buckets module
  BUCKET_LIST: "BucketList",
  BUCKET_DETAIL: "BucketDetail",
  // Ticket Settings module
  WORKFLOW_TEMPLATE: "WorkflowTemplate",
  DROPDOWN_OPTIONS: "DropdownOptions",
  // Trash / Archived modules
  TRASH_VIEW: "TrashView",
  ARCHIVED_VIEW: "ArchivedView",
  // Document Hub module
  DOCUMENT_HUB_LIST: "DocumentHubList",
  DOCUMENT_DETAIL: "DocumentDetail",
  LEADS_LIST: "LeadsList",
  LEAD_DETAIL: "LeadDetail",
  BID_IQ_DASHBOARD: "BidIQDashboard",
  BID_IQ_SETTINGS: "BidIQSettings",
  LEAD_SETTINGS: "LeadSettings",
  LEADS_TRASH: "LeadsTrash",
  PROPOSAL_LIST: "ProposalList",
  PROPOSAL_BUILDER: "ProposalBuilder",
  SQUAD_VIEW: "SquadView",
  ESCALATION_LIST: "EscalationList",
  ESCALATION_SETTINGS: "EscalationSettings",
  ESCALATIONS_TRASH: "EscalationsTrash",
  DAILY_UPDATES_SUBMIT: "DailyUpdatesSubmit",
  DAILY_UPDATES_VIEW: "DailyUpdatesView",
  TIME_TRACKING_MY: "TimeTrackingMy",
  TIME_TRACKING_TEAM: "TimeTrackingTeam",
  ORG_STRUCTURE_OVERVIEW: "OrgStructureOverview",
  ORG_STRUCTURE_GRADES: "OrgStructureGrades",
  ORG_STRUCTURE_EMPLOYMENT_TYPES: "OrgStructureEmploymentTypes",
  ORG_STRUCTURE_DEPARTMENTS: "OrgStructureDepartments",
  ORG_STRUCTURE_SUB_DEPARTMENTS: "OrgStructureSubDepartments",
  ORG_STRUCTURE_POSITIONS: "OrgStructurePositions",
  // Leaves module pages
  LEAVE_REQUESTS: "LeaveRequests",
  LEAVE_APPROVALS: "LeaveApprovals",
  LEAVE_ADJUSTMENTS: "LeaveAdjustments",
  LEAVE_TYPES: "LeaveTypes",
  LEAVE_POLICIES: "LeavePolicies",
  LEAVE_HOLIDAYS: "LeaveHolidays",
  LEAVE_ACCRUAL: "LeaveAccrual",
  // Reimbursement module pages
  REIMBURSEMENT_CLAIMS: "ReimbursementClaims",
  REIMBURSEMENT_APPROVALS: "ReimbursementApprovals",
  REIMBURSEMENT_FINANCE: "ReimbursementFinance",
  REIMBURSEMENT_CATEGORIES: "ReimbursementCategories",
  REIMBURSEMENT_POLICIES: "ReimbursementPolicies",
  // Reimbursement V2 module pages
  REIMBURSEMENT_V2_DASHBOARD: "ReimbursementDashboard",
  REIMBURSEMENT_V2_MY_CLAIMS: "ReimbursementMyClaims",
  REIMBURSEMENT_V2_ADVANCES: "ReimbursementAdvances",
  REIMBURSEMENT_V2_APPROVALS: "ReimbursementApprovals",
  REIMBURSEMENT_V2_FINANCE: "ReimbursementFinance",
  REIMBURSEMENT_V2_CATEGORIES: "ReimbursementCategories",
  REIMBURSEMENT_V2_POLICIES: "ReimbursementPolicies",
  REIMBURSEMENT_V2_BUDGETS: "ReimbursementBudgets",
  REIMBURSEMENT_V2_SETTINGS: "ReimbursementSettings",
  // Payroll V2 module pages
  PAYROLL_V2_GENERAL_SETTINGS: "PayrollGeneralSettings",
  PAYROLL_V2_SALARY_COMPONENTS: "PayrollSalaryComponents",
  PAYROLL_V2_SALARY_STRUCTURES: "PayrollSalaryStructures",
  PAYROLL_V2_PAY_SCHEDULES: "PayrollPaySchedulesAndGroups",
  PAYROLL_V2_STATUTORY: "PayrollStatutory",
  PAYROLL_V2_PT_LWF: "PayrollProfessionalTaxAndLwf",
  PAYROLL_V2_APPROVAL_WORKFLOWS: "PayrollApprovalWorkflows",
  PAYROLL_V2_PAYSLIP_BANK: "PayrollPayslipAndBank",
  PAYROLL_V2_EMPLOYEE_PAY_SETUP: "PayrollEmployeePaySetup",
  PAYROLL_V2_RUN_PAYROLL: "PayrollRunPayroll",
  PAYROLL_V2_REPORTS: "PayrollReports",
  PAYROLL_V2_MY_PAYSLIPS: "PayrollMyPayslips",
  // Onboarding module pages
  ONBOARDING_INVITES: "OnboardingInvites",
  ONBOARDING_EMPLOYEES: "OnboardingEmployees",
  ONBOARDING_DOCUMENT_TYPES: "OnboardingDocumentTypes",
  // Profile pages
  MY_PROFILE: "MyProfile",
  // Attendance pages
  ATTENDANCE_DASHBOARD: "AttendanceDashboard",
  ATTENDANCE_RECORDS: "AttendanceRecords",
  // Performance Report
  PERFORMANCE_REPORT: "PerformanceReport",
  // Clients V2 pages
  CLIENT_LIST: "ClientList",
  CLIENT_DETAIL: "ClientDetail",
  GENERAL_SETTINGS_VIEW: "GeneralSettingsView",
  MEMBER_LIST: "MemberList",
  ROLE_LIST: "RoleList",
  LOGIN: "Login",
  // Finance module pages
  ACCOUNTS_DASHBOARD: "AccountsDashboard",
  ACCOUNTS_SETTINGS: "AccountsSettings",
  INVOICE_LIST: "InvoiceList",
  INVOICE_DETAIL: "InvoiceDetail",
  INVOICE_CUSTOMER_LIST: "InvoiceCustomerList",
  INVOICE_SETTINGS_VIEW: "InvoiceSettingsView",
  INVOICE_TEMPLATE_LIST: "InvoiceTemplateList",
  INVOICE_TRASH_VIEW: "InvoiceTrashView",
} as const;
export type PageT = typeof Page[keyof typeof Page];

export const Action = {
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  TRASH: "trash",
  ARCHIVE: "archive",
  RESTORE: "restore",
  PERMANENT_DELETE: "permanent_delete",
  STATUS_CHANGE: "status_change",
  MOVE: "move",
  CONVERT: "convert",
  VERIFY: "verify",
  REOPEN: "reopen",
  BULK_UPDATE_STATUS: "bulk_update_status",
  BULK_ARCHIVE: "bulk_archive",
  BULK_UNARCHIVE: "bulk_unarchive",
  BULK_DELETE: "bulk_delete",
  BULK_RESTORE: "bulk_restore",
  BULK_PERMANENT_DELETE: "bulk_permanent_delete",
  BULK_MOVE: "bulk_move",
  BULK_CONVERT: "bulk_convert",
  START: "start",
  COMPLETE: "complete",
  APPLY: "apply",
  APPROVE: "approve",
  REJECT: "reject",
  CANCEL: "cancel",
  RUN: "run",
  REVOKE: "revoke",
  ACTIVATE: "activate",
  SUBMIT: "submit",
  BULK_ASSIGN: "bulk_assign",
  BULK_UNASSIGN: "bulk_unassign",
  BULK_RESOLVE: "bulk_resolve",
  GENERATE_AI: "generate_ai",
  EMPTY_TRASH: "empty_trash",
  AUTO_PURGE: "auto_purge",
  REORDER: "reorder",
  SHARE: "share",
  UNSHARE: "unshare",
  DOWNLOAD: "download",
  EMAIL_SENT: "email_sent",
  LOGIN: "login",
  LOGOUT: "logout",
} as const;
export type ActionT = typeof Action[keyof typeof Action] | string;

export const EntityType = {
  CUSTOM: "custom",
  SKILL: "skill",
  EXPERIENCE: "experience",
  TICKET: "ticket",
  BUG: "bug",
  BUG_FOLDER: "bug_folder",
  BUG_SHEET: "bug_sheet",
  BUG_SEVERITY_OPTION: "bug_severity_option",
  BUG_TYPE_OPTION: "bug_type_option",
  PROJECT: "project",
  PROJECT_MEMBER: "project_member",
  RELEASE_PLAN: "release_plan",
  SPRINT_AI_NARRATIVE: "sprint_ai_narrative",
  BUCKET: "bucket",
  BUCKET_MEMBER: "bucket_member",
  WORKFLOW_TEMPLATE: "workflow_template",
  DROPDOWN_OPTION: "dropdown_option",
  DOCUMENT_HUB: "document_hub",
  DOCUMENT_TREE_NODE: "document_tree_node",
  DOCUMENT: "document",
  DOCUMENT_HISTORY_ENTRY: "document_history_entry",
  LEAD: "lead",
  BID_IQ: "bidiq",
  LEAD_STATUS: "lead_status",
  LEAD_ACTION_OPTION: "lead_action_option",
  PROPOSAL: "proposal",
  SQUAD: "squad",
  ESCALATION: "escalation",
  ESCALATION_CATEGORY: "escalation_category",
  ESCALATION_PRIORITY: "escalation_priority",
  ESCALATION_STATUS: "escalation_status",
  DAILY_UPDATE: "daily_update",
  TIME_ENTRY: "time_entry",
  ORG_GRADE: "org_grade",
  ORG_EMPLOYMENT_TYPE: "org_employment_type",
  ORG_DEPARTMENT: "org_department",
  ORG_SUB_DEPARTMENT: "org_sub_department",
  ORG_POSITION: "org_position",
  // HR entities
  LEAVE_REQUEST: "leave_request",
  LEAVE_ADJUSTMENT: "leave_adjustment",
  LEAVE_TYPE: "leave_type",
  LEAVE_POLICY: "leave_policy",
  LEAVE_HOLIDAY: "leave_holiday",
  LEAVE_ACCRUAL_RUN: "leave_accrual_run",
  LEAVE_SETTINGS: "leave_settings",
  ATTENDANCE_RECORD: "attendance_record",
  PERFORMANCE_REPORT: "performance_report",
  // Reimbursement entities
  REIMBURSEMENT_CLAIM: "reimbursement_claim",
  REIMBURSEMENT_CATEGORY: "reimbursement_category",
  REIMBURSEMENT_POLICY: "reimbursement_policy",
  REIMBURSEMENT_BUDGET: "reimbursement_budget",
  REIMBURSEMENT_ADVANCE: "reimbursement_advance",
  REIMBURSEMENT_SETTINGS: "reimbursement_settings",
  // Payroll entities
  PAYROLL_COMPONENT: "payroll_component",
  PAYROLL_STRUCTURE: "payroll_structure",
  PAYROLL_SCHEDULE: "payroll_schedule",
  PAYROLL_STATUTORY: "payroll_statutory",
  PAYROLL_STATUTORY_STATE: "payroll_statutory_state",
  PAYROLL_WORKFLOW: "payroll_workflow",
  PAYROLL_PAYSLIP_BANK_SETTINGS: "payroll_payslip_bank_settings",
  PAYROLL_ASSIGNMENT: "payroll_assignment",
  PAYROLL_RUN: "payroll_run",
  PAYROLL_SETTINGS: "payroll_settings",
  // Onboarding entities
  EMPLOYEE: "employee",
  ONBOARDING_INVITE: "onboarding_invite",
  ONBOARDING_DOCUMENT_TYPE: "onboarding_document_type",
  // Admin entities
  CLIENT: "client",
  CLIENT_CONTACT: "client_contact",
  CLIENT_DOCUMENT: "client_document",
  CLIENT_ALLOCATION: "client_allocation",
  TENANT_SETTINGS: "tenant_settings",
  USER: "user",
  SESSION: "session",
  ROLE: "role",
  PERMISSION: "permission",
  ROLE_PERMISSION: "role_permission",
  USER_ROLE: "user_role",
  // Finance entities
  INVOICE: "invoice",
  ACCOUNT_TRANSACTION: "account_transaction",
  EXPENSE_CATEGORY: "expense_category",
  INVOICE_PAYMENT: "invoice_payment",
  INVOICE_TEMPLATE: "invoice_template",
  INVOICE_CUSTOMER: "invoice_customer",
  INVOICE_SETTINGS_PROFILE: "invoice_settings_profile",
} as const;

// ===== PII scrub =====
const SENSITIVE_KEY = /password|passwd|token|secret|authorization|api[_-]?key/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 8 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

// ===== Diff =====
// Compares before/after by top-level keys present in `after`. Returns the list
// of keys whose value changed, plus trimmed before/after maps with only those
// keys (so we don't blow up storage with unchanged fields).
export function diffShallow(
  before: Record<string, any> | null | undefined,
  after: Record<string, any> | null | undefined
): { changedFields: string[]; before: Record<string, any>; after: Record<string, any> } {
  const changed: string[] = [];
  const b: Record<string, any> = {};
  const a: Record<string, any> = {};
  if (!after) return { changedFields: changed, before: b, after: a };
  for (const key of Object.keys(after)) {
    const av = (after as any)[key];
    const bv = before ? (before as any)[key] : undefined;
    if (JSON.stringify(av) !== JSON.stringify(bv)) {
      changed.push(key);
      b[key] = bv ?? null;
      a[key] = av ?? null;
    }
  }
  return { changedFields: changed, before: b, after: a };
}

// ===== Input shape =====
export interface RecordTransactionInput {
  req: AuthRequest;
  section: SectionT;
  module: ModuleT;
  page?: PageT | string | null;
  action: ActionT;
  actionLabel?: string;
  entityType?: string;
  entityId?: string | null;
  entityLabel?: string | null;
  parentEntityType?: string | null;
  parentEntityId?: string | null;
  beforeData?: Record<string, any> | null;
  afterData?: Record<string, any> | null;
  changedFields?: string[];
  statusCode?: number;
  durationMs?: number;
  correlationId?: string;
  metadata?: Record<string, any> | null;
  actorType?: "staff" | "client_portal" | "system" | "api_key";
}

function clientIp(req: Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

// Route pattern (e.g. "/api/tickets/:id") — survives different `:id` values
// in the index. Falls back to originalUrl path if route.path is missing.
function routePattern(req: Request): string | null {
  const r = (req as any).route?.path as string | undefined;
  const base = (req as any).baseUrl as string | undefined;
  if (r) return `${base ?? ""}${r}`;
  return (req as any).originalUrl?.split("?")[0] ?? null;
}

// Fire-and-forget insert. Never throws — logging must not break the request.
export function recordTransaction(input: RecordTransactionInput): void {
  const { req } = input;
  if (!req.tenantId || !req.user) return; // can't audit without identity

  const before = input.beforeData ? (scrub(input.beforeData) as Record<string, any>) : null;
  const after = input.afterData ? (scrub(input.afterData) as Record<string, any>) : null;
  const metadata = input.metadata ? (scrub(input.metadata) as Record<string, any>) : null;

  // The FE can override section / module / page via request headers when the
  // same BE endpoint is reachable from multiple views (e.g. /api/trash/move is
  // hit from the Tickets list AND from the Archived view). The controller's
  // values are the *default*; headers win when present.
  const hSection = (req.headers["x-zspace-section"] as string | undefined)?.trim();
  const hModule = (req.headers["x-zspace-module"] as string | undefined)?.trim();
  const hPage = (req.headers["x-zspace-page"] as string | undefined)?.trim();

  const params = [
    req.tenantId,
    hSection || input.section,
    hModule || input.module,
    hPage || input.page || null,
    input.action,
    input.actionLabel ?? null,
    input.entityType ?? null,
    input.entityId ?? null,
    input.entityLabel ?? null,
    input.parentEntityType ?? null,
    input.parentEntityId ?? null,
    req.user.id,
    input.actorType ?? "staff",
    (req.user as any).email ?? null,
    (req.user as any).name ?? null,
    before ? JSON.stringify(before) : null,
    after ? JSON.stringify(after) : null,
    input.changedFields ?? null,
    req.method ?? null,
    routePattern(req),
    input.statusCode ?? null,
    input.durationMs ?? null,
    clientIp(req),
    req.headers["user-agent"] ?? null,
    (req.user as any).sessionId ?? null,
    input.correlationId ?? null,
    "web",
    metadata ? JSON.stringify(metadata) : null,
  ];

  const sql = `
    INSERT INTO transaction_history (
      tenant_id, section, module, page,
      action, action_label,
      entity_type, entity_id, entity_label,
      parent_entity_type, parent_entity_id,
      actor_id, actor_type, actor_email, actor_name,
      before_data, after_data, changed_fields,
      request_method, request_path, status_code, duration_ms,
      ip_address, user_agent,
      session_id, correlation_id, source, metadata
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6,
      $7, $8, $9,
      $10, $11,
      $12, $13, $14, $15,
      $16::jsonb, $17::jsonb, $18,
      $19, $20, $21, $22,
      $23, $24,
      $25, $26, $27, $28::jsonb
    )
    RETURNING id, created_at
  `;

  const tenantId = req.tenantId;
  pool
    .query(sql, params)
    .then((result) => {
      const row = result.rows[0];
      if (!row) return;

      // Build the row in the same shape the GET endpoint returns so the FE
      // can render it without an extra fetch.
      const payload = {
        id: row.id,
        section: hSection || input.section,
        module: hModule || input.module,
        page: hPage || input.page || null,
        action: input.action,
        actionLabel: input.actionLabel ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        entityLabel: input.entityLabel ?? null,
        parentEntityType: input.parentEntityType ?? null,
        parentEntityId: input.parentEntityId ?? null,
        actor: {
          id: req.user!.id,
          type: input.actorType ?? "staff",
          name: (req.user as any).name ?? null,
          email: (req.user as any).email ?? null,
        },
        impersonatorId: null,
        changedFields: input.changedFields ?? null,
        beforeData: before,
        afterData: after,
        requestMethod: req.method ?? null,
        requestPath: routePattern(req),
        statusCode: input.statusCode ?? null,
        durationMs: input.durationMs ?? null,
        correlationId: input.correlationId ?? null,
        source: "web",
        metadata,
        createdAt: row.created_at,
      };

      socketService.emitToTenant(tenantId, "transaction:created", payload);
    })
    .catch((err) => {
      console.error("[transactionHistory] insert failed:", err?.message ?? err);
    });
}
