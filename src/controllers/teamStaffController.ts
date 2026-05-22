import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest } from "@/types";

const VALID_DISCIPLINES = new Set([
  "engineering",
  "design",
  "qa",
  "pm",
  "account",
  "devops",
  "data",
  "support",
  "other",
]);
const VALID_AVAILABILITY = new Set([
  "available",
  "limited",
  "away",
  "unavailable",
]);

export class TeamStaffController {
  /** GET /api/clients-v2/:clientId/team */
  static async listForClient(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { clientId } = req.params;
    const r = await pool.query(
      `SELECT t.id, t.staff_user_id, t.display_name, t.role_label, t.discipline,
              t.contact_email, t.contact_phone, t.is_primary_contact, t.bio,
              t.availability_status, t.availability_note, t.is_visible, t.position,
              t.created_at, t.updated_at,
              t.project_id, p.name AS project_name, p.code AS project_code,
              u.name AS staff_user_name, u.work_email AS staff_user_email,
              u.avatar_url AS staff_user_avatar
         FROM portal_team_members t
         LEFT JOIN projects p ON p.id = t.project_id
         LEFT JOIN users u ON u.id = t.staff_user_id
        WHERE t.tenant_id = $1 AND t.client_id = $2
        ORDER BY t.position ASC, t.created_at ASC`,
      [tenantId, clientId],
    );
    res.json({
      success: true,
      data: r.rows.map(shapeRow),
    });
  }

  /**
   * GET /api/clients-v2/:clientId/team/staff-options
   * Returns staff users in this tenant for the picker. Optional ?search=.
   * We intentionally don't try to narrow to allocated employees — staff may
   * want to add the account manager who isn't an "allocated" resource.
   */
  static async staffOptions(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const search = ((req.query.search as string) || "").trim();
    const params: any[] = [tenantId];
    let where = `WHERE u.tenant_id = $1 AND u.is_active = TRUE`;
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (u.name ILIKE $${params.length} OR u.work_email ILIKE $${params.length})`;
    }
    const r = await pool.query(
      `SELECT u.id, u.name, u.work_email, u.avatar_url, p.title AS title
         FROM users u
         LEFT JOIN positions p ON u.position_id = p.id
         ${where}
        ORDER BY u.name ASC
        LIMIT 50`,
      params,
    );
    res.json({ success: true, data: r.rows });
  }

  /** POST /api/clients-v2/:clientId/team */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user?.id || null;
    const { clientId } = req.params;
    const b = req.body || {};

    if (!b.displayName?.trim() && !b.staffUserId) {
      res.status(400).json({
        success: false,
        error: "displayName or staffUserId is required",
      });
      return;
    }
    if (!b.roleLabel?.trim()) {
      res.status(400).json({ success: false, error: "roleLabel is required" });
      return;
    }
    if (b.discipline && !VALID_DISCIPLINES.has(String(b.discipline))) {
      res.status(400).json({ success: false, error: "Invalid discipline" });
      return;
    }
    const availability = b.availabilityStatus || "available";
    if (!VALID_AVAILABILITY.has(availability)) {
      res.status(400).json({ success: false, error: "Invalid availability" });
      return;
    }

    const cl = await pool.query(
      `SELECT 1 FROM clients_v2 WHERE id = $1 AND tenant_id = $2`,
      [clientId, tenantId],
    );
    if (cl.rowCount === 0) {
      res.status(404).json({ success: false, error: "Client not found" });
      return;
    }
    if (b.projectId) {
      const ok = await pool.query(
        `SELECT 1 FROM client_projects
          WHERE tenant_id = $1 AND client_id = $2 AND project_id = $3`,
        [tenantId, clientId, b.projectId],
      );
      if (ok.rowCount === 0) {
        res.status(400).json({
          success: false,
          error: "projectId is not linked to this client",
        });
        return;
      }
    }

    // Pull staff user name as fallback for display
    let displayName = b.displayName?.trim();
    if (!displayName && b.staffUserId) {
      const u = await pool.query(
        `SELECT name FROM users WHERE id = $1 AND tenant_id = $2`,
        [b.staffUserId, tenantId],
      );
      if (u.rowCount === 0) {
        res.status(400).json({ success: false, error: "Staff user not found" });
        return;
      }
      displayName = u.rows[0].name;
    }

    const posR = await pool.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
         FROM portal_team_members
        WHERE tenant_id = $1 AND client_id = $2`,
      [tenantId, clientId],
    );

    const ins = await pool.query(
      `INSERT INTO portal_team_members
         (tenant_id, client_id, project_id, staff_user_id, display_name,
          role_label, discipline, contact_email, contact_phone,
          is_primary_contact, bio, availability_status, availability_note,
          is_visible, position, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id`,
      [
        tenantId,
        clientId,
        b.projectId || null,
        b.staffUserId || null,
        displayName,
        b.roleLabel.trim(),
        b.discipline || null,
        b.contactEmail || null,
        b.contactPhone || null,
        b.isPrimaryContact === true,
        b.bio || null,
        availability,
        b.availabilityNote || null,
        b.isVisible !== false,
        posR.rows[0].next_pos,
        userId,
      ],
    );
    res.status(201).json({ success: true, data: { id: ins.rows[0].id } });
  }

  /** PUT /api/team/:id */
  static async update(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const b = req.body || {};

    const cur = await pool.query(
      `SELECT id FROM portal_team_members WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (cur.rowCount === 0) {
      res.status(404).json({ success: false, error: "Team member not found" });
      return;
    }

    const sets: string[] = [];
    const params: any[] = [];
    const push = (col: string, val: any) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };

    if (b.displayName !== undefined)
      push("display_name", String(b.displayName).trim());
    if (b.roleLabel !== undefined)
      push("role_label", String(b.roleLabel).trim());
    if (b.discipline !== undefined) {
      if (b.discipline && !VALID_DISCIPLINES.has(String(b.discipline))) {
        res.status(400).json({ success: false, error: "Invalid discipline" });
        return;
      }
      push("discipline", b.discipline || null);
    }
    if (b.contactEmail !== undefined)
      push("contact_email", b.contactEmail || null);
    if (b.contactPhone !== undefined)
      push("contact_phone", b.contactPhone || null);
    if (b.isPrimaryContact !== undefined)
      push("is_primary_contact", b.isPrimaryContact === true);
    if (b.bio !== undefined) push("bio", b.bio || null);
    if (b.availabilityStatus !== undefined) {
      if (!VALID_AVAILABILITY.has(String(b.availabilityStatus))) {
        res
          .status(400)
          .json({ success: false, error: "Invalid availability" });
        return;
      }
      push("availability_status", b.availabilityStatus);
    }
    if (b.availabilityNote !== undefined)
      push("availability_note", b.availabilityNote || null);
    if (b.isVisible !== undefined) push("is_visible", b.isVisible === true);
    if (b.position !== undefined) push("position", Number(b.position));
    if (b.projectId !== undefined) push("project_id", b.projectId || null);
    if (b.staffUserId !== undefined)
      push("staff_user_id", b.staffUserId || null);

    if (sets.length === 0) {
      res.status(400).json({ success: false, error: "Nothing to update" });
      return;
    }
    params.push(id);
    params.push(tenantId);
    await pool.query(
      `UPDATE portal_team_members
          SET ${sets.join(", ")}, updated_at = NOW()
        WHERE id = $${params.length - 1} AND tenant_id = $${params.length}`,
      params,
    );
    res.json({ success: true });
  }

  /** DELETE /api/team/:id */
  static async remove(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const r = await pool.query(
      `DELETE FROM portal_team_members WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    if (r.rowCount === 0) {
      res.status(404).json({ success: false, error: "Team member not found" });
      return;
    }
    res.json({ success: true });
  }

  /**
   * POST /api/clients-v2/:clientId/team/reorder
   * body: { order: string[] }   (ordered team-member ids)
   * Used by drag-to-reorder UI; we just rewrite positions.
   */
  static async reorder(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { clientId } = req.params;
    const order: string[] = Array.isArray(req.body?.order) ? req.body.order : [];
    for (let i = 0; i < order.length; i++) {
      await pool.query(
        `UPDATE portal_team_members
            SET position = $1, updated_at = NOW()
          WHERE id = $2 AND tenant_id = $3 AND client_id = $4`,
        [i, order[i], tenantId, clientId],
      );
    }
    res.json({ success: true });
  }
}

function shapeRow(row: any) {
  return {
    id: row.id,
    staffUserId: row.staff_user_id,
    staffUserName: row.staff_user_name,
    staffUserEmail: row.staff_user_email,
    staffUserAvatar: row.staff_user_avatar,
    displayName: row.display_name,
    roleLabel: row.role_label,
    discipline: row.discipline,
    // For the staff view we return both override + fallback so the UI can
    // show what the client will actually see.
    contactEmail: row.contact_email || row.staff_user_email || null,
    contactEmailOverride: row.contact_email,
    contactPhone: row.contact_phone,
    isPrimaryContact: row.is_primary_contact,
    bio: row.bio,
    availabilityStatus: row.availability_status,
    availabilityNote: row.availability_note,
    isVisible: row.is_visible,
    position: row.position,
    projectId: row.project_id,
    projectName: row.project_name,
    projectCode: row.project_code,
    avatarUrl: row.staff_user_avatar,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default TeamStaffController;
