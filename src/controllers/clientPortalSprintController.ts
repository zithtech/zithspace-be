import { Request, Response } from "express";
import pool from "@/config/dbpool";

/**
 * Phase 2 — Sprints (read-only).
 *
 * "Sprints" in this codebase are rows in `release_plans` with `type IN ('sprint', 'sprint_plan')`.
 * Tickets connect via `tickets.sprint_plan_id`. We scope to the portal user's
 * client through `client_projects` (the CRM client ↔ project join table).
 *
 * Completion semantics:
 *  - "completed" ticket = status IN ('done','completed','closed','resolved')
 *    (the staff app stores status as a free-text string per project workflow,
 *     so we match the common completion words case-insensitively).
 *  - "blocked"   ticket = status IN ('blocked','blocker')
 *  - "added-after-sprint" = ticket created after sprint.startedAt OR
 *    (when startedAt is null) after sprint.created_at
 */

const COMPLETED = new Set(["done", "completed", "closed", "resolved"]);
const BLOCKED = new Set(["blocked", "blocker", "on hold", "on_hold"]);

function classify(status: string | null): "completed" | "blocked" | "open" {
  const s = (status || "").toLowerCase().trim();
  if (COMPLETED.has(s)) return "completed";
  if (BLOCKED.has(s)) return "blocked";
  return "open";
}

async function projectsForPortalUser(
  tenantId: string,
  clientId: string,
): Promise<string[]> {
  const r = await pool.query(
    `SELECT project_id
       FROM client_projects
      WHERE tenant_id = $1 AND client_id = $2`,
    [tenantId, clientId],
  );
  return r.rows.map((row) => row.project_id);
}

export class ClientPortalSprintController {
  /**
   * GET /api/client-portal/sprints?status=&projectId=&search=&page=&limit=
   */
  static async list(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const projectIds = await projectsForPortalUser(ctx.tenantId, ctx.clientId);
    if (projectIds.length === 0) {
      res.json({
        success: true,
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: 0,
          counts: {},
          projects: [],
        },
      });
      return;
    }

    const statusFilter = ((req.query.status as string) || "").toLowerCase();
    const projectFilter = (req.query.projectId as string) || "";
    const search = ((req.query.search as string) || "").trim();
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
    );
    const offset = (page - 1) * limit;

    const params: any[] = [ctx.tenantId, projectIds];
    let where = `WHERE rp.tenant_id = $1
                   AND rp.project_id = ANY($2::text[])
                   AND rp.type IN ('sprint', 'sprint_plan')`;

    if (projectFilter) {
      params.push(projectFilter);
      where += ` AND rp.project_id = $${params.length}`;
    }
    if (statusFilter && statusFilter !== "all") {
      params.push(statusFilter);
      where += ` AND LOWER(rp.status) = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (rp.version ILIKE $${params.length}
                  OR COALESCE(rp.goal,'') ILIKE $${params.length}
                  OR COALESCE(rp.description,'') ILIKE $${params.length})`;
    }

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM release_plans rp ${where}`,
      params,
    );
    const total = countRes.rows[0]?.n || 0;

    params.push(limit);
    params.push(offset);

    const list = await pool.query(
      `SELECT rp.id, rp.version, rp.description, rp.goal, rp.status,
              rp.start_date, rp.end_date, rp.started_at, rp.completed_at,
              rp.release_date, rp.committed_points, rp.completed_points,
              rp.created_at,
              p.id    AS project_id,
              p.name  AS project_name,
              p.code  AS project_code,
              (SELECT COUNT(*)::int FROM tickets t
                WHERE t.sprint_plan_id = rp.id AND t.is_deleted IS NOT TRUE)
                AS ticket_count,
              (SELECT COUNT(*)::int FROM tickets t
                WHERE t.sprint_plan_id = rp.id AND t.is_deleted IS NOT TRUE
                  AND LOWER(t.status) IN ('done','completed','closed','resolved'))
                AS done_count,
              (SELECT COUNT(*)::int FROM tickets t
                WHERE t.sprint_plan_id = rp.id AND t.is_deleted IS NOT TRUE
                  AND LOWER(t.status) IN ('blocked','blocker','on hold','on_hold'))
                AS blocked_count
         FROM release_plans rp
         JOIN projects p ON p.id = rp.project_id
         ${where}
         ORDER BY COALESCE(rp.start_date, rp.created_at) DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const items = list.rows.map((row) => {
      const committed = row.committed_points || 0;
      const completed = row.completed_points || 0;
      const ticketCount = row.ticket_count || 0;
      const doneCount = row.done_count || 0;
      return {
        id: row.id,
        version: row.version,
        goal: row.goal,
        description: row.description,
        status: row.status,
        startDate: row.start_date,
        endDate: row.end_date,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        releaseDate: row.release_date,
        committedPoints: committed,
        completedPoints: completed,
        ticketCount,
        doneCount,
        blockedCount: row.blocked_count || 0,
        completionPercent:
          ticketCount > 0
            ? Math.round((doneCount / ticketCount) * 100)
            : 0,
        pointsPercent:
          committed > 0 ? Math.round((completed / committed) * 100) : 0,
        project: {
          id: row.project_id,
          name: row.project_name,
          code: row.project_code,
        },
      };
    });

    // Sprint-status counts and project list for the FE filter pills
    let countsWhere = `WHERE rp.tenant_id = $1
          AND rp.type IN ('sprint', 'sprint_plan')`;
    const countsParams: any[] = [ctx.tenantId];

    if (projectFilter) {
      countsParams.push(projectFilter);
      countsWhere += ` AND rp.project_id = $${countsParams.length}`;
    } else {
      countsParams.push(projectIds);
      countsWhere += ` AND rp.project_id = ANY($${countsParams.length}::text[])`;
    }

    const counts = await pool.query(
      `SELECT LOWER(rp.status) AS status, COUNT(*)::int AS n
         FROM release_plans rp
        ${countsWhere}
        GROUP BY LOWER(rp.status)`,
      countsParams,
    );
    const countMap: Record<string, number> = {};
    for (const r of counts.rows) countMap[r.status || "unknown"] = r.n;

    const projectsRes = await pool.query(
      `SELECT p.id, p.name, p.code
         FROM projects p
        WHERE p.id = ANY($1::text[])
        ORDER BY p.name ASC`,
      [projectIds],
    );

    res.json({
      success: true,
      data: items,
      meta: {
        total,
        page,
        limit,
        counts: countMap,
        projects: projectsRes.rows,
      },
    });
  }

  /**
   * GET /api/client-portal/sprints/:id
   * Detail: header + tickets categorised + demo/staging links pulled from
   * project repositories metadata when present.
   */
  static async detail(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    const { id } = req.params;

    const projectIds = await projectsForPortalUser(ctx.tenantId, ctx.clientId);
    if (projectIds.length === 0) {
      res.status(404).json({ success: false, error: "Sprint not found" });
      return;
    }

    const planRes = await pool.query(
      `SELECT rp.id, rp.version, rp.description, rp.goal, rp.status,
              rp.start_date, rp.end_date, rp.started_at, rp.completed_at,
              rp.release_date, rp.committed_points, rp.completed_points,
              rp.created_at,
              p.id AS project_id, p.name AS project_name, p.code AS project_code,
              p.repositories, p.description AS project_description
         FROM release_plans rp
         JOIN projects p ON p.id = rp.project_id
        WHERE rp.id = $1 AND rp.tenant_id = $2
          AND rp.project_id = ANY($3::text[])
          AND rp.type IN ('sprint', 'sprint_plan')`,
      [id, ctx.tenantId, projectIds],
    );
    const plan = planRes.rows[0];
    if (!plan) {
      res.status(404).json({ success: false, error: "Sprint not found" });
      return;
    }

    const ticketsRes = await pool.query(
      `SELECT id, ticket_number, title, status, priority, type,
              story_point, estimate_hours, assignee_id, due_date,
              completed_at, created_at, updated_at, tags
         FROM tickets
        WHERE sprint_plan_id = $1
          AND tenant_id = $2
          AND is_deleted IS NOT TRUE
        ORDER BY
          CASE LOWER(priority)
            WHEN 'critical (p0)' THEN 1
            WHEN 'high (p1)' THEN 2
            WHEN 'medium (p2)' THEN 3
            WHEN 'low (p3)' THEN 4
            ELSE 5
          END,
          created_at ASC`,
      [id, ctx.tenantId],
    );

    // Tag tickets as added-after-sprint when their creation is past the
    // sprint start.
    const sprintStartTs = new Date(
      plan.started_at || plan.start_date || plan.created_at,
    ).getTime();

    const tickets = ticketsRes.rows.map((t) => {
      const category = classify(t.status);
      const addedAfter =
        new Date(t.created_at).getTime() > sprintStartTs + 5 * 60 * 1000; // 5 min grace
      return {
        id: t.id,
        ticketNumber: t.ticket_number,
        title: t.title,
        status: t.status,
        priority: t.priority,
        type: t.type,
        storyPoint: t.story_point || 0,
        estimateHours: t.estimate_hours,
        dueDate: t.due_date,
        completedAt: t.completed_at,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        tags: t.tags || [],
        category,
        addedAfterSprint: addedAfter,
      };
    });

    // Group for the UI
    const buckets = {
      completed: tickets.filter((t) => t.category === "completed"),
      blocked: tickets.filter((t) => t.category === "blocked"),
      open: tickets.filter((t) => t.category === "open"),
      addedAfter: tickets.filter((t) => t.addedAfterSprint),
    };

    // Repositories blob on Project sometimes holds demo/staging URLs. We try
    // to extract obvious ones without coupling to a specific shape.
    const links: { label: string; url: string }[] = [];
    try {
      const repos = plan.repositories;
      const seen = new Set<string>();
      const visit = (val: any, label?: string) => {
        if (!val) return;
        if (typeof val === "string" && /^https?:\/\//i.test(val)) {
          if (!seen.has(val)) {
            seen.add(val);
            links.push({ label: label || "Link", url: val });
          }
          return;
        }
        if (Array.isArray(val)) val.forEach((v) => visit(v));
        else if (typeof val === "object") {
          for (const [k, v] of Object.entries(val)) {
            const niceLabel = k
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase());
            visit(v, niceLabel);
          }
        }
      };
      visit(repos);
    } catch {
      /* ignore */
    }

    res.json({
      success: true,
      data: {
        id: plan.id,
        version: plan.version,
        goal: plan.goal,
        description: plan.description,
        status: plan.status,
        startDate: plan.start_date,
        endDate: plan.end_date,
        startedAt: plan.started_at,
        completedAt: plan.completed_at,
        releaseDate: plan.release_date,
        committedPoints: plan.committed_points || 0,
        completedPoints: plan.completed_points || 0,
        completionPercent:
          tickets.length > 0
            ? Math.round((buckets.completed.length / tickets.length) * 100)
            : 0,
        pointsPercent:
          plan.committed_points > 0
            ? Math.round(
                ((plan.completed_points || 0) / plan.committed_points) * 100,
              )
            : 0,
        counts: {
          total: tickets.length,
          completed: buckets.completed.length,
          blocked: buckets.blocked.length,
          open: buckets.open.length,
          addedAfter: buckets.addedAfter.length,
        },
        project: {
          id: plan.project_id,
          name: plan.project_name,
          code: plan.project_code,
          description: plan.project_description,
        },
        links,
        tickets,
      },
    });
  }
}

export default ClientPortalSprintController;
