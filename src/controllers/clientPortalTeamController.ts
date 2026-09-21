import { Request, Response } from "express";
import pool from "@/config/dbpool";

/**
 * Portal-side read of the curated team list. Hides any rows where
 * `is_visible = false`. Coalesces contact email to the staff user's
 * work email when no override is set.
 */
export class ClientPortalTeamController {
  /** GET /api/client-portal/team */
  static async list(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const search = ((req.query.search as string) || "").trim();
    const discipline = ((req.query.discipline as string) || "").trim();
    const projectId = ((req.query.projectId as string) || "").trim();
    const availability = ((req.query.availability as string) || "").trim();
    const hasPagination = req.query.page !== undefined || req.query.limit !== undefined;
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) || "15", 10)),
    );
    const offset = (page - 1) * limit;

    const params: any[] = [ctx.tenantId, ctx.clientId];
    let where = `WHERE t.tenant_id = $1 AND t.client_id = $2 AND t.is_visible = TRUE`;

    if (discipline && discipline !== "ALL") {
      params.push(discipline);
      where += ` AND (COALESCE(t.discipline, 'other') = $${params.length})`;
    }
    if (projectId) {
      params.push(projectId);
      where += ` AND t.project_id = $${params.length}`;
    }
    if (availability && availability !== "ALL") {
      params.push(availability);
      where += ` AND t.availability_status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (t.display_name ILIKE $${params.length}
                   OR t.role_label ILIKE $${params.length}
                   OR t.contact_email ILIKE $${params.length}
                   OR u.work_email ILIKE $${params.length}
                   OR t.bio ILIKE $${params.length})`;
    }

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM portal_team_members t
         LEFT JOIN users u ON u.id = t.staff_user_id
         ${where}`,
      params,
    );
    const total = countRes.rows[0]?.n || 0;

    // Distinct projects
    const projectsRes = await pool.query(
      `SELECT DISTINCT p.id, p.name, p.code
         FROM portal_team_members t
         JOIN projects p ON p.id = t.project_id
        WHERE t.tenant_id = $1 AND t.client_id = $2 AND t.is_visible = TRUE
        ORDER BY p.name ASC`,
      [ctx.tenantId, ctx.clientId],
    );

    // Stats across all client visible team members
    const statsRes = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(CASE WHEN t.is_primary_contact THEN 1 END)::int AS primaries,
         COUNT(CASE WHEN t.availability_status = 'available' THEN 1 END)::int AS available,
         COUNT(DISTINCT COALESCE(t.discipline, 'other'))::int AS disciplines
       FROM portal_team_members t
      WHERE t.tenant_id = $1 AND t.client_id = $2 AND t.is_visible = TRUE`,
      [ctx.tenantId, ctx.clientId],
    );

    const stats = {
      total: statsRes.rows[0]?.total || 0,
      primaries: statsRes.rows[0]?.primaries || 0,
      available: statsRes.rows[0]?.available || 0,
      disciplines: statsRes.rows[0]?.disciplines || 0,
    };

    let query = `SELECT t.id, t.display_name, t.role_label, t.discipline,
               COALESCE(t.contact_email, u.work_email) AS contact_email,
               t.contact_phone, t.is_primary_contact, t.bio,
               t.availability_status, t.availability_note, t.position,
               u.avatar_url AS avatar_url,
               t.project_id, p.name AS project_name, p.code AS project_code
          FROM portal_team_members t
          LEFT JOIN users u ON u.id = t.staff_user_id
          LEFT JOIN projects p ON p.id = t.project_id
          ${where}
         ORDER BY
           CASE WHEN t.is_primary_contact THEN 0 ELSE 1 END,
           t.position ASC, t.created_at ASC`;

    if (hasPagination) {
      params.push(limit);
      params.push(offset);
      query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
    }

    const r = await pool.query(query, params);

    const data = r.rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      roleLabel: row.role_label,
      discipline: row.discipline,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      isPrimaryContact: row.is_primary_contact,
      bio: row.bio,
      availabilityStatus: row.availability_status,
      availabilityNote: row.availability_note,
      position: row.position,
      avatarUrl: row.avatar_url,
      projectId: row.project_id,
      projectName: row.project_name,
      projectCode: row.project_code,
    }));

    res.json({
      success: true,
      data,
      meta: {
        total,
        page: hasPagination ? page : 1,
        limit: hasPagination ? limit : total,
        totalPages: hasPagination ? Math.ceil(total / limit) : 1,
        stats,
        projects: projectsRes.rows.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
        })),
      },
    });
  }
}

export default ClientPortalTeamController;
