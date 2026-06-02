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
  return {
    id: row.id,
    section: row.section,
    module: row.module,
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
      if (moduleFilter) push("module = $$", moduleFilter);
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

      res.json({
        success: true,
        data: {
          sections: sections.rows.map((r: any) => r.section),
          modules: modules.rows.map((r: any) => ({ section: r.section, module: r.module })),
          pages: pages.rows.map((r: any) => ({ module: r.module, page: r.page })),
          actions: actions.rows.map((r: any) => r.action),
          entityTypes: entityTypes.rows.map((r: any) => r.entity_type),
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
