import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest, ApiResponse } from "@/types";
import { productFromRequest } from "@/config/brand";
import { subscriptionService } from "@/modules/subscriptions/subscription.service";
import { navigationService } from "@/modules/subscriptions/subscription.navigation";
import {
  PREDEFINED_SECTIONS,
  PREDEFINED_MODULES,
  PREDEFINED_PAGES,
  PREDEFINED_ACTIONS,
  PREDEFINED_ENTITY_TYPES,
  HIDDEN_MODULES,
  MODULE_REWRITES,
  SECTION_REWRITES,
  PAGE_REWRITES
} from "@/config/activityLog.config";

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

function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  let n = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (n === "hr") return "hrms"; // Map legacy "HR" section to metadata "hrms" key
  return n;
}

// Maps database 'module' names to their corresponding metadata 'key' 
// when they do not naturally match (e.g. historical log names vs new UI routes)
const DB_TO_METADATA_MODULE_MAP: Record<string, string> = {
  "roleandpermissions": "roles",
  "generalsettings": "settings",
  "qaworkspace": "qaspace",
  "buglist": "qaspace",
  "qa": "qaspace",
  "apihub": "qaspace",
};

async function getActivityLogCapabilities(req: AuthRequest): Promise<Map<string, Set<string>>> {
  const fs = require('fs');
  const logFile = '/tmp/zukvo_activity_log.txt';
  const product = productFromRequest(req) ?? undefined;
  fs.appendFileSync(logFile, `\n\n--- Request ---\nTenantId: ${req.tenantId}\nProduct: ${product}\nHost: ${req.headers.host}\nx-zukvo-product: ${req.headers['x-zukvo-product']}\n`);
  
  const subscription = await subscriptionService.getTenantSubscription(req.tenantId!, product);
  fs.appendFileSync(logFile, `Subscription features length: ${subscription?.features?.length}\nFeatures: ${JSON.stringify(subscription?.features)}\n`);
  
  const allowed = new Map<string, Set<string>>();
  if (!subscription?.features?.length) {
    fs.appendFileSync(logFile, `No features, returning empty map.\n`);
    return allowed;
  }

  const subFeaturesSet = new Set(subscription.features);
  const { MetadataService } = require('@/modules/metadata/metadata.service');
  const fullTree = await MetadataService.getMetadataTree();

  for (const core of fullTree) {
    const sectionNorm = normalizeName(core.key);
    
    for (const mod of core.modules || []) {
      const modPrefixes = [mod.key, `${core.key}_${mod.key}`];
      let moduleAllowed = false;
      
      for (const f of subscription.features) {
        if (modPrefixes.some(k => f === k || f.startsWith(k + "_"))) {
          moduleAllowed = true;
          break;
        }
      }

      if (moduleAllowed) {
        if (!allowed.has(sectionNorm)) {
          allowed.set(sectionNorm, new Set());
        }
        allowed.get(sectionNorm)!.add(normalizeName(mod.key));
        
        for (const page of mod.pages || []) {
          const pagePrefixes = [page.key, `${core.key}_${mod.key}_${page.key}`];
          for (const f of subscription.features) {
            if (pagePrefixes.some(k => f === k || f.startsWith(k + "_"))) {
              allowed.get(sectionNorm)!.add(normalizeName(page.key));
              break;
            }
          }
        }
      }
    }
  }

  return allowed;
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
  
  let sec = row.section;
  if (sec === "HR") sec = "HRMS";

  return {
    id: row.id,
    section: sec,
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

      const allowedCapabilities = await getActivityLogCapabilities(req);
      if (allowedCapabilities.size === 0) {
        // No subscription features = no access
        res.json({ success: true, data: [], total: 0 });
        return;
      }

      // Pre-fetch all available sections and modules in the tenant's DB 
      // so we can build a safe SQL query using exact DB string values.
      const dbModulesRes = await pool.query(
        `SELECT DISTINCT section, module FROM transaction_history WHERE tenant_id = $1`,
        [req.tenantId]
      );
      
      const validDbCombinations = dbModulesRes.rows.filter(r => {
        if (!r.section) return false; // Ignore rogue rows
        const secNorm = normalizeName(r.section);
        if (!allowedCapabilities.has(secNorm)) return false; // Section not allowed
        
        const modNorm = normalizeName(r.module);
        const allowedMods = allowedCapabilities.get(secNorm)!;
        
        // If the licensed section has no module restrictions in metadata, allow all DB modules for it
        if (allowedMods.size === 0) return true;
        // If the DB row has no module but the section is allowed, allow it (e.g. section-level actions)
        if (!r.module) return true;
        
        // Check if there is an explicit mapping for this DB module to a metadata key
        let mappedModNorm = DB_TO_METADATA_MODULE_MAP[modNorm] || modNorm;

        // HOME DB modules map to homegeneral page keys in the metadata.
        return allowedMods.has(modNorm) || 
              allowedMods.has(mappedModNorm);
      });
      
      if (validDbCombinations.length === 0) {
        // None of the DB activity matches the allowed features
        res.json({ success: true, data: [], total: 0 });
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

      // Apply dynamic capability filter
      const comboSql = validDbCombinations.map(combo => {
        if (combo.module) {
          return `(section = '${combo.section}' AND module = '${combo.module}')`;
        } else {
          return `(section = '${combo.section}' AND module IS NULL)`;
        }
      }).join(" OR ");
      where.push(`(${comboSql})`);

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

      const allowedCapabilities = await getActivityLogCapabilities(req);
      if (allowedCapabilities.size === 0) {
        res.json({
          success: true,
          data: { sections: [], modules: [], pages: [], actions: [], pageActions: [], entityTypes: [] },
        });
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
          `SELECT DISTINCT module, page, action FROM transaction_history WHERE tenant_id = $1 AND page IS NOT NULL AND action IS NOT NULL`,
          [req.tenantId]
        ),
      ]);

      // Filter distinct db rows and predefined constants with dynamic capabilities
      const sectionsSet = new Set<string>();
      PREDEFINED_SECTIONS.forEach(s => {
        if (allowedCapabilities.has(normalizeName(s))) sectionsSet.add(s);
      });
      sections.rows.forEach((r: any) => {
        if (r.section && allowedCapabilities.has(normalizeName(r.section))) {
          sectionsSet.add(r.section === "HR" ? "HRMS" : r.section);
        }
      });

      const modulesMap = new Map<string, string>();
      PREDEFINED_MODULES.forEach((m) => {
        const secNorm = normalizeName(m.section);
        const modNorm = normalizeName(m.module);
        if (allowedCapabilities.has(secNorm)) {
          const allowedMods = allowedCapabilities.get(secNorm)!;
          let mappedModNorm = DB_TO_METADATA_MODULE_MAP[modNorm] || modNorm;
          
          if (allowedMods.size === 0 || allowedMods.has(modNorm) || allowedMods.has(mappedModNorm)) {
            modulesMap.set(m.module, m.section);
          }
        }
      });

      modules.rows.forEach((r: any) => {
        if (r.module && r.section) {
          let modName = r.module;
          
          modName = MODULE_REWRITES[modName] || modName;
          if (normalizeName(modName) === "apihub") {
            modName = "ApiHub";
          }
          
          if (SECTION_REWRITES[modName]) {
            r.section = SECTION_REWRITES[modName];
          }
          
          let displaySection = r.section;
          if (displaySection === "HR") displaySection = "HRMS";
          
          const secNorm = normalizeName(r.section);
          const origModNorm = normalizeName(r.module);
          let mappedModNorm = DB_TO_METADATA_MODULE_MAP[origModNorm] || origModNorm;

          if (allowedCapabilities.has(secNorm)) {
            const allowedMods = allowedCapabilities.get(secNorm)!;
            if (allowedMods.size === 0 || allowedMods.has(origModNorm) || allowedMods.has(mappedModNorm)) {
              modulesMap.set(modName, displaySection);
            }
          }
        }
      });

      const finalModules = Array.from(modulesMap.entries())
        .filter(([module, section]) => !HIDDEN_MODULES.includes(module))
        .map(([module, section]) => ({
          section,
          module,
        }));

      const pagesMap = new Map<string, string>();
      PREDEFINED_PAGES.forEach((p) => pagesMap.set(p.page, p.module));
      pages.rows.forEach((r: any) => {
        if (r.page && r.module) {
          let modName = r.module;
          modName = MODULE_REWRITES[modName] || modName;
          pagesMap.set(r.page, modName);
        }
      });
      const finalPages = Array.from(pagesMap.entries())
        .filter(([page, module]) => {
          if (!modulesMap.has(module)) return false;
          return true;
        })
        .map(([page, module]) => ({
          module,
          page,
        }));

      const actionsSet = new Set(PREDEFINED_ACTIONS);
      actions.rows.forEach((r: any) => {
        if (r.action) actionsSet.add(r.action);
      });

      const entityTypesSet = new Set(PREDEFINED_ENTITY_TYPES);
      entityTypes.rows.forEach((r: any) => {
        if (r.entity_type) entityTypesSet.add(r.entity_type);
      });

      const pageActionsSet = new Set<string>();
      pageActionsResult.rows.forEach((r: any) => {
        let mod = r.module;
        let pg = r.page;
        
        mod = MODULE_REWRITES[mod] || mod;
        
        if (PAGE_REWRITES[mod] && PAGE_REWRITES[mod][pg]) {
          pg = PAGE_REWRITES[mod][pg];
        }
        
        if (modulesMap.has(mod)) {
          pageActionsSet.add(JSON.stringify({ page: pg, action: r.action }));
        }
      });

      const pageActionsList = Array.from(pageActionsSet).map((s) => JSON.parse(s));
      pageActionsList.sort((a, b) => a.page.localeCompare(b.page) || a.action.localeCompare(b.action));

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
