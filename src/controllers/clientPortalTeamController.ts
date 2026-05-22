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
    const r = await pool.query(
      `SELECT t.id, t.display_name, t.role_label, t.discipline,
              COALESCE(t.contact_email, u.work_email) AS contact_email,
              t.contact_phone, t.is_primary_contact, t.bio,
              t.availability_status, t.availability_note, t.position,
              u.avatar_url AS avatar_url,
              t.project_id, p.name AS project_name, p.code AS project_code
         FROM portal_team_members t
         LEFT JOIN users u ON u.id = t.staff_user_id
         LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.tenant_id = $1 AND t.client_id = $2
          AND t.is_visible = TRUE
        ORDER BY
          CASE WHEN t.is_primary_contact THEN 0 ELSE 1 END,
          t.position ASC, t.created_at ASC`,
      [ctx.tenantId, ctx.clientId],
    );

    res.json({
      success: true,
      data: r.rows.map((row) => ({
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
      })),
    });
  }
}

export default ClientPortalTeamController;
