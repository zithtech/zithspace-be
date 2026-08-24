import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest, ApiResponse } from "@/types";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

function asString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

function asArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return undefined;
}

function asInt(v: unknown, fallback: number, max: number): number {
  const n = parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const [iso, id] = raw.split("|");
    if (!iso || !id) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return { createdAt: d, id };
  } catch {
    return null;
  }
}

function shapeRow(row: any) {
  let mod = row.module;
  let pg = row.page;
  
  if (["InvoiceCustomers", "InvoiceSettings", "InvoiceTemplates", "InvoiceTrash"].includes(mod)) {
    mod = "Invoices";
  }
  if (mod === "BugList" || mod === "QA") {
    mod = "QaWorkspace";
    if (["TestCases", "TestCaseDetails", "QaCaseDetail", "QaParentCase"].includes(pg)) pg = "QaCaseList";
    else if (["TestRuns", "TestRunExecution", "QaRunDetail"].includes(pg)) pg = "QaRunList";
    else if (["TestSuites", "QaSuiteDetail"].includes(pg)) pg = "QaSuiteList";
    else if (["TestScope", "CreateTestScope", "EditTestScope", "QaScopeDetail"].includes(pg)) pg = "QaScopeList";
    else if (["QaSubmissions", "QaSubmissionForm", "QaSubmissionDetail"].includes(pg)) pg = "QaSubmissionList";
    else if (["BugFolderList", "BugSheetList", "BugTrash"].includes(pg)) pg = "BugList";
    else if (pg === "BugSettings") pg = "QaSettings";
  }
  
  return {
    id: row.id,
    section: row.section,
    module: mod,
    page: pg,
    action: row.action,
    actionLabel: row.action_label,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityLabel: row.entity_label,
    parentEntityType: row.parent_entity_type,
    parentEntityId: row.parent_entity_id,
    actor: {
      id: row.actor_id,
      type: row.actor_type,
      name: row.actor_name,
      email: row.actor_email,
    },
    impersonatorId: row.impersonator_id,
    changedFields: row.changed_fields,
    beforeData: row.before_data,
    afterData: row.after_data,
    requestMethod: row.request_method,
    requestPath: row.request_path,
    statusCode: row.status_code,
    durationMs: row.duration_ms,
    correlationId: row.correlation_id,
    source: row.source,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

export class TransactionHistoryController {
  /**
   * GET /api/transaction-history
   *
   * Two modes:
   *   1. Entity-scoped (drawer): pass entityType + entityId together
   *      → requires ACTIVITY_LOG_READ (route-level guard).
   *   2. Global (admin page): no entityType/entityId
   *      → requires ACTIVITY_LOG_READ_ALL (route-level guard).
   *
   * Pagination: cursor-based on (created_at DESC, id DESC).
   */
  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const entityType = asString(req.query.entityType);
      const entityId = asString(req.query.entityId);

      // Reject half-specified entity scope
      if ((entityType && !entityId) || (!entityType && entityId)) {
        res.status(400).json({
          success: false,
          error: "entityType and entityId must be provided together",
        } as ApiResponse);
        return;
      }

      const actorId = asString(req.query.actorId);
      const section = asString(req.query.section);
      const moduleFilter = asString(req.query.module);
      const page = asString(req.query.page);
      const actions = asArray(req.query.action);
      const correlationId = asString(req.query.correlationId);
      const search = asString(req.query.search);
      const from = asString(req.query.from);
      const to = asString(req.query.to);
      const limit = asInt(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
      const cursor = asString(req.query.cursor);
      // `pageNum` is the offset-pagination page (1-based). The nav-page filter
      // uses `page` (e.g. "TicketList"). Keep these distinct to avoid collision.
      const pageNum = asInt(req.query.pageNum, 0, 100000); // 0 = not provided
      const usePageMode = !cursor && pageNum > 0;

      // Build the shared WHERE clause; params[] order: tenant_id is always $1.
      const where: string[] = ["tenant_id = $1"];
      const baseParams: any[] = [req.tenantId];
      const push = (sql: string, value: any) => {
        baseParams.push(value);
        where.push(sql.replace("$$", `$${baseParams.length}`));
      };

      if (entityType && entityId) {
        push("entity_type = $$", entityType);
        push("entity_id = $$", entityId);
      }
      if (actorId) push("actor_id = $$", actorId);
      if (section) {
        if (section === "ADMIN") {
          if (moduleFilter === "OrgStructure") {
            // Skip section filter so we can fetch old OrgStructure rows that were logged under WORK
          } else if (!moduleFilter) {
            where.push(`(section = $${baseParams.length + 1} OR module = 'OrgStructure')`);
            baseParams.push(section);
          } else {
            push("section = $$", section);
          }
        } else if (section === "WORK") {
          push("section = $$", section);
          if (!moduleFilter) {
            push("module != $$", "OrgStructure");
          }
        } else {
          push("section = $$", section);
        }
      }
      if (moduleFilter) {
        if (moduleFilter === "Invoices") {
          push("module = ANY($$::text[])", ["Invoices", "InvoiceCustomers", "InvoiceSettings", "InvoiceTemplates", "InvoiceTrash"]);
        } else if (moduleFilter === "Tickets") {
          // If the user selected the Tickets module, we include all the sub-modules that were mapped to its pages.
          if (!page) {
            push("module = ANY($$::text[])", ["Tickets", "Sprints", "Buckets", "TicketSettings", "Trash", "Archived"]);
          } else {
            // If a specific page is selected under Tickets, we map it to the underlying DB modules/pages
            if (page === "Plans") {
              push("module = $$", "Sprints");
            } else if (page === "TicketList") {
              push("module = $$", "Tickets");
            } else if (page === "Buckets") {
              push("module = $$", "Buckets");
            } else if (page === "Reports") {
              push("page = $$", "SprintReport");
            } else if (page === "Settings") {
              push("module = $$", "TicketSettings");
            } else if (page === "Trash") {
              push("module = $$", "Trash");
            } else if (page === "Archive") {
              push("module = $$", "Archived");
            } else {
              push("module = $$", "Tickets");
              push("page = $$", page);
            }
          }
        } else if (moduleFilter === "QaWorkspace") {
          push("module = ANY($$::text[])", ["QaWorkspace", "BugList", "QA"]);
          if (page) {
            if (page === "QaCaseList") {
              push("page = ANY($$::text[])", ["QaCaseList", "QaCaseDetail", "TestCases", "TestCaseDetails", "QaParentCase"]);
            } else if (page === "QaRunList") {
              push("page = ANY($$::text[])", ["QaRunList", "QaRunDetail", "TestRuns", "TestRunExecution"]);
            } else if (page === "QaSuiteList") {
              push("page = ANY($$::text[])", ["QaSuiteList", "QaSuiteDetail", "TestSuites"]);
            } else if (page === "QaScopeList") {
              push("page = ANY($$::text[])", ["QaScopeList", "QaScopeDetail", "TestScope", "CreateTestScope", "EditTestScope"]);
            } else if (page === "QaSubmissionList") {
              push("page = ANY($$::text[])", ["QaSubmissionList", "QaSubmissionDetail", "QaSubmissions", "QaSubmissionForm"]);
            } else if (page === "BugList") {
              push("page = ANY($$::text[])", ["BugList", "BugFolderList", "BugSheetList", "BugTrash"]);
            } else if (page === "QaSettings") {
              push("page = ANY($$::text[])", ["QaSettings", "BugSettings"]);
            } else {
              push("page = $$", page);
            }
          }
        } else if (moduleFilter === "LeadsManagement") {
          push("module = $$", "Leads");
          if (page) push("page = $$", page);
        } else if (moduleFilter === "TimeTracking") {
          if (page === "TimeTrackingDetails") {
            push("module = $$", "TimeTracking");
            push("page = $$", "TicketDetail");
          } else {
            push("module = $$", "TimeTracking");
            if (page) push("page = $$", page);
          }
        } else {
          push("module = $$", moduleFilter);
          if (page) push("page = $$", page);
        }
      } else {
        if (page) push("page = $$", page);
      }
      if (actions && actions.length > 0) push("action = ANY($$::text[])", actions);
      if (correlationId) push("correlation_id = $$", correlationId);
      if (from) push("created_at >= $$", new Date(from));
      if (to) push("created_at <= $$", new Date(to));
      if (search) {
        baseParams.push(`%${search}%`);
        const idx = baseParams.length;
        where.push(`(action_label ILIKE $${idx} OR entity_label ILIKE $${idx})`);
      }

      const whereSql = where.join(" AND ");

      // ── Count query (runs in parallel with data fetch) ───────────────
      const countPromise = pool.query<{ total: string }>(
        `SELECT COUNT(*)::bigint AS total FROM transaction_history WHERE ${whereSql}`,
        baseParams
      );

      // ── Data query ───────────────────────────────────────────────────
      let dataSql: string;
      const dataParams = [...baseParams];

      if (usePageMode) {
        // Offset pagination
        const offset = (pageNum - 1) * limit;
        dataParams.push(limit);
        dataParams.push(offset);
        dataSql = `
          SELECT
            id, tenant_id, section, module, page,
            action, action_label,
            entity_type, entity_id, entity_label,
            parent_entity_type, parent_entity_id,
            actor_id, actor_type, actor_email, actor_name, impersonator_id,
            before_data, after_data, changed_fields,
            request_method, request_path, status_code, duration_ms,
            ip_address, user_agent,
            session_id, correlation_id, source, metadata,
            created_at
          FROM transaction_history
          WHERE ${whereSql}
          ORDER BY created_at DESC, id DESC
          LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
        `;
      } else {
        // Cursor pagination (drawer / infinite-scroll consumers)
        if (cursor) {
          const c = decodeCursor(cursor);
          if (c) {
            dataParams.push(c.createdAt);
            dataParams.push(c.id);
            where.push(
              `(created_at, id) < ($${dataParams.length - 1}, $${dataParams.length})`
            );
          }
        }
        dataParams.push(limit + 1); // fetch one extra to detect "more"
        dataSql = `
          SELECT
            id, tenant_id, section, module, page,
            action, action_label,
            entity_type, entity_id, entity_label,
            parent_entity_type, parent_entity_id,
            actor_id, actor_type, actor_email, actor_name, impersonator_id,
            before_data, after_data, changed_fields,
            request_method, request_path, status_code, duration_ms,
            ip_address, user_agent,
            session_id, correlation_id, source, metadata,
            created_at
          FROM transaction_history
          WHERE ${where.join(" AND ")}
          ORDER BY created_at DESC, id DESC
          LIMIT $${dataParams.length}
        `;
      }

      const [dataResult, countResult] = await Promise.all([
        pool.query(dataSql, dataParams),
        countPromise,
      ]);

      const total = parseInt(countResult.rows[0]?.total ?? "0", 10);
      const rows = dataResult.rows;

      if (usePageMode) {
        const totalPages = Math.max(1, Math.ceil(total / limit));
        res.json({
          success: true,
          data: rows.map(shapeRow),
          total,
          page: pageNum,
          limit,
          totalPages,
        });
      } else {
        let nextCursor: string | null = null;
        if (rows.length > limit) {
          const last = rows[limit - 1];
          nextCursor = encodeCursor(last.created_at, last.id);
          rows.length = limit;
        }
        res.json({
          success: true,
          data: rows.map(shapeRow),
          nextCursor,
          total,
        });
      }
    } catch (err: any) {
      console.error("[transactionHistory] list error:", err);
      res.status(500).json({
        success: false,
        error: err?.message ?? "Failed to load transaction history",
      } as ApiResponse);
    }
  }

  /**
   * GET /api/transaction-history/filters
   *
   * Returns the distinct values currently in the log for building UI filter
   * dropdowns (sections, modules, pages, actions). Cheap because of the
   * existing (tenant_id, section, module) and (tenant_id, action) indexes.
   *
   * Requires ACTIVITY_LOG_READ_ALL (route-level guard).
   */
  static async filters(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const [sections, modules, pages, actions, entityTypes, pageActionsResult] = await Promise.all([
        pool.query(
          `SELECT DISTINCT section FROM transaction_history WHERE tenant_id = $1 ORDER BY section`,
          [req.tenantId]
        ),
        pool.query(
          `SELECT DISTINCT section, module FROM transaction_history WHERE tenant_id = $1 ORDER BY section, module`,
          [req.tenantId]
        ),
        pool.query(
          `SELECT DISTINCT module, page FROM transaction_history WHERE tenant_id = $1 AND page IS NOT NULL ORDER BY module, page`,
          [req.tenantId]
        ),
        pool.query(
          `SELECT DISTINCT action FROM transaction_history WHERE tenant_id = $1 ORDER BY action`,
          [req.tenantId]
        ),
        pool.query(
          `SELECT DISTINCT entity_type FROM transaction_history WHERE tenant_id = $1 AND entity_type IS NOT NULL ORDER BY entity_type`,
          [req.tenantId]
        ),
        pool.query(
          `SELECT DISTINCT page, action FROM transaction_history WHERE tenant_id = $1 AND page IS NOT NULL AND action IS NOT NULL ORDER BY page, action`,
          [req.tenantId]
        ),
      ]);

      const predefinedSections = ["WORK", "HR", "ADMIN", "FINANCE"];
      const predefinedModules = [
        { section: "WORK", module: "Tickets" },
        { section: "WORK", module: "Projects" },
        { section: "WORK", module: "TimeTracking" },
        { section: "WORK", module: "DailyUpdates" },
        { section: "WORK", module: "DocumentHub" },
        { section: "WORK", module: "Proposals" },
        { section: "WORK", module: "Squad" },
        { section: "WORK", module: "Escalations" },
        { section: "WORK", module: "LeadsManagement" },
        { section: "WORK", module: "BidIQ" },
        { section: "WORK", module: "QaWorkspace" },
        { section: "HR", module: "Leaves" },
        { section: "HR", module: "Onboarding" },
        { section: "HR", module: "Attendance" },
        { section: "HR", module: "MyProfile" },
        { section: "HR", module: "PerformanceReport" },
        { section: "ADMIN", module: "ClientsV2" },
        { section: "ADMIN", module: "GeneralSettings" },
        { section: "ADMIN", module: "Members" },
        { section: "ADMIN", module: "RoleAndPermissions" },
        { section: "ADMIN", module: "OrgStructure" },
        { section: "HOME", module: "Dashboard" },
        { section: "HOME", module: "Integrations" },
        { section: "HOME", module: "Skills" },
        { section: "HOME", module: "Messages" },
        { section: "HOME", module: "Bookmarks" },
        { section: "ADMIN", module: "Auth" },
        { section: "FINANCE", module: "Accounts" },
        { section: "FINANCE", module: "Invoices" },
        { section: "FINANCE", module: "ReimbursementV2" },
        { section: "FINANCE", module: "PayrollV2" },
      ];
      const predefinedPages = [
        { module: "Tickets", page: "Plans" },
        { module: "Tickets", page: "TicketList" },
        { module: "Tickets", page: "Buckets" },
        { module: "Tickets", page: "Reports" },
        { module: "Tickets", page: "Settings" },
        { module: "Tickets", page: "Trash" },
        { module: "Tickets", page: "Archive" },
        { module: "QaWorkspace", page: "QaScopeList" },
        { module: "QaWorkspace", page: "QaCaseList" },
        { module: "QaWorkspace", page: "QaSuiteList" },
        { module: "QaWorkspace", page: "QaRunList" },
        { module: "QaWorkspace", page: "BugList" },
        { module: "QaWorkspace", page: "QaSubmissionList" },
        { module: "QaWorkspace", page: "QaApprovals" },
        { module: "QaWorkspace", page: "QaAnalytics" },
        { module: "QaWorkspace", page: "QaSettings" },
        { module: "DocumentHub", page: "DocumentHubList" },
        { module: "DocumentHub", page: "DocumentDetail" },
        { module: "LeadsManagement", page: "LeadsList" },
        { module: "LeadsManagement", page: "LeadDetail" },
        { module: "LeadsManagement", page: "LeadSettings" },
        { module: "LeadsManagement", page: "LeadsTrash" },
        { module: "BidIQ", page: "BidIQDashboard" },
        { module: "BidIQ", page: "BidIQSettings" },

        { module: "Proposals", page: "ProposalList" },
        { module: "Proposals", page: "ProposalBuilder" },
        { module: "Squad", page: "SquadView" },
        { module: "Escalations", page: "EscalationList" },
        { module: "Escalations", page: "EscalationSettings" },
        { module: "Escalations", page: "EscalationsTrash" },
        { module: "DailyUpdates", page: "DailyUpdatesSubmit" },
        { module: "TimeTracking", page: "TimeTrackingMy" },
        { module: "TimeTracking", page: "TimeTrackingTeam" },
        { module: "OrgStructure", page: "OrgStructureOverview" },
        { module: "OrgStructure", page: "OrgStructureGrades" },
        { module: "OrgStructure", page: "OrgStructureEmploymentTypes" },
        { module: "OrgStructure", page: "OrgStructureDepartments" },
        { module: "OrgStructure", page: "OrgStructureSubDepartments" },
        { module: "OrgStructure", page: "OrgStructurePositions" },
        { module: "Leaves", page: "LeaveRequests" },
        { module: "Leaves", page: "LeaveApprovals" },
        { module: "Leaves", page: "LeaveAdjustments" },
        { module: "Leaves", page: "LeaveTypes" },
        { module: "Leaves", page: "LeavePolicies" },
        { module: "Leaves", page: "LeaveHolidays" },
        { module: "Leaves", page: "LeaveAccrual" },
        { module: "Onboarding", page: "OnboardingInvites" },
        { module: "Onboarding", page: "OnboardingEmployees" },
        { module: "Onboarding", page: "OnboardingDocumentTypes" },
        { module: "Attendance", page: "AttendanceDashboard" },
        { module: "Attendance", page: "AttendanceRecords" },
        { module: "MyProfile", page: "MyProfile" },
        { module: "PerformanceReport", page: "PerformanceReport" },
        { module: "ClientsV2", page: "ClientList" },
        { module: "ClientsV2", page: "ClientDetail" },
        { module: "GeneralSettings", page: "GeneralSettingsView" },
        { module: "Members", page: "MemberList" },
        { module: "RoleAndPermissions", page: "RoleList" },
        { module: "Auth", page: "Login" },
        { module: "Accounts", page: "AccountsDashboard" },
        { module: "Accounts", page: "AccountsSettings" },
        { module: "Invoices", page: "InvoiceList" },
        { module: "Invoices", page: "InvoiceDetail" },
        { module: "Invoices", page: "InvoiceCustomerList" },
        { module: "Invoices", page: "InvoiceSettingsView" },
        { module: "Invoices", page: "InvoiceTemplateList" },
        { module: "Invoices", page: "InvoiceTrashView" },
        { module: "ReimbursementV2", page: "ReimbursementDashboard" },
        { module: "ReimbursementV2", page: "ReimbursementMyClaims" },
        { module: "ReimbursementV2", page: "ReimbursementAdvances" },
        { module: "ReimbursementV2", page: "ReimbursementApprovals" },
        { module: "ReimbursementV2", page: "ReimbursementFinance" },
        { module: "ReimbursementV2", page: "ReimbursementCategories" },
        { module: "ReimbursementV2", page: "ReimbursementPolicies" },
        { module: "ReimbursementV2", page: "ReimbursementBudgets" },
        { module: "ReimbursementV2", page: "ReimbursementSettings" },
        { module: "PayrollV2", page: "PayrollGeneralSettings" },
        { module: "PayrollV2", page: "PayrollSalaryComponents" },
        { module: "PayrollV2", page: "PayrollSalaryStructures" },
        { module: "PayrollV2", page: "PayrollPaySchedulesAndGroups" },
        { module: "PayrollV2", page: "PayrollStatutory" },
        { module: "PayrollV2", page: "PayrollProfessionalTaxAndLwf" },
        { module: "PayrollV2", page: "PayrollApprovalWorkflows" },
        { module: "PayrollV2", page: "PayrollPayslipAndBank" },
        { module: "PayrollV2", page: "PayrollEmployeePaySetup" },
        { module: "PayrollV2", page: "PayrollRunPayroll" },
        { module: "PayrollV2", page: "PayrollReports" },
        { module: "PayrollV2", page: "PayrollMyPayslips" },
      ];
      const predefinedActions = [
        "create", "update", "delete", "archive", "restore", "permanent_delete", "status_change",
        "move", "convert", "verify", "reopen", "bulk_update_status", "bulk_archive", "bulk_unarchive",
        "bulk_delete", "bulk_restore", "bulk_permanent_delete", "bulk_move", "bulk_convert", "start",
        "complete", "bulk_assign", "bulk_unassign", "bulk_resolve", "generate_ai", "empty_trash",
        "auto_purge", "reorder", "share", "unshare", "download", "email_sent", "login", "logout",
        "apply", "approve", "reject", "cancel", "run", "revoke", "activate", "submit"
      ];
      const predefinedEntityTypes = [
        "ticket", "bug", "bug_folder", "bug_sheet", "bug_severity_option", "bug_type_option",
        "project", "project_member", "release_plan", "sprint_ai_narrative", "bucket", "bucket_member",
        "workflow_template", "dropdown_option", "document_hub", "document_tree_node", "document",
        "document_history_entry", "lead", "lead_status", "lead_action_option", "proposal", "squad",
        "escalation", "escalation_category", "escalation_priority", "escalation_status", "daily_update",
        "time_entry", "org_grade", "org_employment_type", "org_department", "org_sub_department", "org_position", "client", "client_contact", "client_document", "client_allocation",
        "tenant_settings", "user", "role", "permission", "role_permission", "user_role",
        "invoice", "account_transaction", "invoice_payment",
        "invoice_template", "invoice_customer", "invoice_settings_profile", "session",
        "leave_request", "leave_adjustment", "leave_type", "leave_policy",
        "qa_submission", "qa_parent_case", "qa_case", "qa_suite", "qa_run", "qa_scope", "qa_settings", "qa_analytics", "qa_module",
        "leave_holiday", "leave_accrual_run", "leave_settings",
        "employee", "onboarding_invite", "onboarding_document_type",
        "attendance_record", "performance_report"
      ];

      // Union distinct db rows with predefined constants
      const sectionsSet = new Set(predefinedSections);
      sections.rows.forEach((r: any) => {
        if (r.section) sectionsSet.add(r.section);
      });

      const modulesMap = new Map<string, string>();
      predefinedModules.forEach((m) => modulesMap.set(m.module, m.section));
      modules.rows.forEach((r: any) => {
        if (r.module && r.section) {
          let modName = r.module;
          if (["InvoiceCustomers", "InvoiceSettings", "InvoiceTemplates", "InvoiceTrash"].includes(modName)) {
            modName = "Invoices";
          }
          if (["Sprints", "Buckets", "TicketSettings", "Trash", "Archived"].includes(modName)) {
            modName = "Tickets";
          }
          if (modName === "BugList" || modName === "QA") {
            modName = "QaWorkspace";
          }
          if (modName === "Leads") {
            modName = "LeadsManagement";
          }
          if (modName === "OrgStructure") {
            r.section = "ADMIN";
          }
          modulesMap.set(modName, r.section);
        }
      });
      const allowedWorkModules = new Set([
        "Tickets", "Projects", "TimeTracking", "DailyUpdates", "DocumentHub",
        "Proposals", "Squad", "Escalations", "LeadsManagement", "BidIQ", "QaWorkspace"
      ]);

      const finalModules = Array.from(modulesMap.entries())
        .filter(([module, section]) => {
          if (["InvoiceCustomers", "InvoiceSettings", "InvoiceTemplates", "InvoiceTrash", "Reimbursement"].includes(module)) return false;
          if (section === "WORK" && !allowedWorkModules.has(module)) return false;
          return true;
        })
        .map(([module, section]) => ({
          section,
          module,
        }));

      const pagesMap = new Map<string, string>();
      predefinedPages.forEach((p) => pagesMap.set(p.page, p.module));
      pages.rows.forEach((r: any) => {
        if (r.page && r.module) {
          let modName = r.module;
          if (["InvoiceCustomers", "InvoiceSettings", "InvoiceTemplates", "InvoiceTrash"].includes(modName)) {
            modName = "Invoices";
          }
          if (["Sprints", "Buckets", "TicketSettings", "Trash", "Archived"].includes(modName)) {
            modName = "Tickets";
          }
          if (modName === "BugList" || modName === "QA") {
            modName = "QaWorkspace";
          }
          if (modName === "Leads") {
            modName = "LeadsManagement";
          }
          pagesMap.set(r.page, modName);
        }
      });
      const finalPages = Array.from(pagesMap.entries())
        .filter(([page, module]) => {
          if (module === "Reimbursement") return false;
          const allowedTicketPages = new Set(["Plans", "TicketList", "Buckets", "Reports", "Settings", "Trash", "Archive"]);
          if (module === "Tickets" && !allowedTicketPages.has(page)) return false;
          
          const allowedQaPages = new Set([
            "QaScopeList", "QaCaseList", "QaSuiteList", "QaRunList", 
            "BugList", "QaSubmissionList", "QaApprovals", "QaAnalytics", "QaSettings"
          ]);
          if (module === "QaWorkspace" && !allowedQaPages.has(page)) return false;
          const section = modulesMap.get(module);
          if (section === "WORK" && !allowedWorkModules.has(module)) return false;
          return true;
        })
        .map(([page, module]) => ({
          module,
          page,
        }));

      const actionsSet = new Set(predefinedActions);
      actions.rows.forEach((r: any) => {
        if (r.action) actionsSet.add(r.action);
      });

      const entityTypesSet = new Set(predefinedEntityTypes);
      entityTypes.rows.forEach((r: any) => {
        if (r.entity_type) entityTypesSet.add(r.entity_type);
      });

      const pageActionsList = pageActionsResult.rows.map((r: any) => ({
        page: r.page,
        action: r.action,
      }));

      res.json({
        success: true,
        data: {
          sections: Array.from(sectionsSet).sort(),
          modules: finalModules.sort((a, b) => a.section.localeCompare(b.section) || a.module.localeCompare(b.module)),
          pages: finalPages.sort((a, b) => a.module.localeCompare(b.module) || a.page.localeCompare(b.page)),
          actions: Array.from(actionsSet).sort(),
          pageActions: pageActionsList,
          entityTypes: Array.from(entityTypesSet).sort(),
        },
      });
    } catch (err: any) {
      console.error("[transactionHistory] filters error:", err);
      res.status(500).json({
        success: false,
        error: err?.message ?? "Failed to load filter options",
      } as ApiResponse);
    }
  }
}
