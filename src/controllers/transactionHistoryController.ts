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
  if (["InvoiceCustomers", "InvoiceSettings", "InvoiceTemplates", "InvoiceTrash"].includes(mod)) {
    mod = "Invoices";
  }
  return {
    id: row.id,
    section: row.section,
    module: mod,
    page: row.page,
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
      if (section) push("section = $$", section);
      if (moduleFilter) {
        if (moduleFilter === "Invoices") {
          push("module = ANY($$::text[])", ["Invoices", "InvoiceCustomers", "InvoiceSettings", "InvoiceTemplates", "InvoiceTrash"]);
        } else {
          push("module = $$", moduleFilter);
        }
      }
      if (page) push("page = $$", page);
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

      const [sections, modules, pages, actions, entityTypes] = await Promise.all([
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
      ]);

      const predefinedSections = ["WORK", "HR", "ADMIN", "FINANCE"];
      const predefinedModules = [
        { section: "WORK", module: "Tickets" },
        { section: "WORK", module: "BugList" },
        { section: "WORK", module: "Projects" },
        { section: "WORK", module: "Sprints" },
        { section: "WORK", module: "Buckets" },
        { section: "WORK", module: "TicketSettings" },
        { section: "WORK", module: "Trash" },
        { section: "WORK", module: "Archived" },
        { section: "WORK", module: "DocumentHub" },
        { section: "WORK", module: "Leads" },
        { section: "WORK", module: "Proposals" },
        { section: "WORK", module: "Squad" },
        { section: "WORK", module: "Escalations" },
        { section: "WORK", module: "DailyUpdates" },
        { section: "WORK", module: "TimeTracking" },
        { section: "WORK", module: "OrgStructure" },
        { section: "HR", module: "Leaves" },
        { section: "HR", module: "Onboarding" },
        { section: "ADMIN", module: "ClientsV2" },
        { section: "ADMIN", module: "GeneralSettings" },
        { section: "ADMIN", module: "Members" },
        { section: "ADMIN", module: "RoleAndPermissions" },
        { section: "ADMIN", module: "Auth" },
        { section: "FINANCE", module: "Accounts" },
        { section: "FINANCE", module: "Invoices" },
      ];
      const predefinedPages = [
        { module: "Tickets", page: "TicketList" },
        { module: "Tickets", page: "TicketDetail" },
        { module: "Tickets", page: "TicketKanban" },
        { module: "Tickets", page: "TicketEpic" },
        { module: "BugList", page: "BugFolderList" },
        { module: "BugList", page: "BugSheetList" },
        { module: "BugList", page: "BugList" },
        { module: "BugList", page: "BugSettings" },
        { module: "BugList", page: "BugTrash" },
        { module: "Projects", page: "ProjectList" },
        { module: "Projects", page: "ProjectDetail" },
        { module: "Projects", page: "ProjectTrash" },
        { module: "Sprints", page: "SprintList" },
        { module: "Sprints", page: "SprintDetail" },
        { module: "Sprints", page: "SprintCompletion" },
        { module: "Sprints", page: "SprintReport" },
        { module: "Buckets", page: "BucketList" },
        { module: "Buckets", page: "BucketDetail" },
        { module: "TicketSettings", page: "WorkflowTemplate" },
        { module: "TicketSettings", page: "DropdownOptions" },
        { module: "Trash", page: "TrashView" },
        { module: "Archived", page: "ArchivedView" },
        { module: "DocumentHub", page: "DocumentHubList" },
        { module: "DocumentHub", page: "DocumentDetail" },
        { module: "Leads", page: "LeadsList" },
        { module: "Leads", page: "LeadDetail" },
        { module: "Leads", page: "LeadSettings" },
        { module: "Leads", page: "LeadsTrash" },
        { module: "Proposals", page: "ProposalList" },
        { module: "Proposals", page: "ProposalBuilder" },
        { module: "Squad", page: "SquadView" },
        { module: "Escalations", page: "EscalationList" },
        { module: "Escalations", page: "EscalationSettings" },
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
        "leave_holiday", "leave_accrual_run", "leave_settings",
        "employee", "onboarding_invite", "onboarding_document_type"
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
          modulesMap.set(modName, r.section);
        }
      });
      const finalModules = Array.from(modulesMap.entries())
        .filter(([module]) => !["InvoiceCustomers", "InvoiceSettings", "InvoiceTemplates", "InvoiceTrash"].includes(module))
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
          pagesMap.set(r.page, modName);
        }
      });
      const finalPages = Array.from(pagesMap.entries()).map(([page, module]) => ({
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

      res.json({
        success: true,
        data: {
          sections: Array.from(sectionsSet).sort(),
          modules: finalModules.sort((a, b) => a.section.localeCompare(b.section) || a.module.localeCompare(b.module)),
          pages: finalPages.sort((a, b) => a.module.localeCompare(b.module) || a.page.localeCompare(b.page)),
          actions: Array.from(actionsSet).sort(),
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
