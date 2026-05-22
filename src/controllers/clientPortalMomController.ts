import { Request, Response } from "express";
import pool from "@/config/dbpool";

/**
 * Portal read-only view of MOMs. We surface only `status='published'` AND
 * `visibility='client'` rows. Action items are shown but cannot be modified
 * — that lives on the staff side.
 */
export class ClientPortalMomController {
  /**
   * GET /api/client-portal/moms?projectId=&search=&page=&limit=
   */
  static async list(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    const search = ((req.query.search as string) || "").trim();
    const projectId = (req.query.projectId as string) || "";
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
    );
    const offset = (page - 1) * limit;

    const params: any[] = [ctx.tenantId, ctx.clientId];
    let where = `WHERE m.tenant_id = $1
                   AND m.client_id = $2
                   AND m.status = 'published'
                   AND m.visibility = 'client'`;
    if (projectId) {
      params.push(projectId);
      where += ` AND m.project_id = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (m.title ILIKE $${params.length}
                  OR m.mom_number ILIKE $${params.length})`;
    }

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM portal_moms m ${where}`,
      params,
    );
    const total = countRes.rows[0]?.n || 0;

    params.push(limit);
    params.push(offset);

    const list = await pool.query(
      `SELECT m.id, m.mom_number, m.title, m.meeting_date, m.duration_minutes,
              m.project_id, m.recording_url, m.summary, m.created_at,
              p.name AS project_name,
              (SELECT COUNT(*)::int FROM portal_mom_action_items ai
                WHERE ai.mom_id = m.id) AS action_count,
              (SELECT COUNT(*)::int FROM portal_mom_action_items ai
                WHERE ai.mom_id = m.id AND ai.status IN ('open','in_progress'))
                AS open_action_count,
              (SELECT COUNT(*)::int FROM portal_mom_attendees a
                WHERE a.mom_id = m.id) AS attendee_count,
              (SELECT COUNT(*)::int FROM portal_mom_decisions d
                WHERE d.mom_id = m.id) AS decision_count,
              (SELECT COUNT(*)::int FROM portal_mom_attachments at
                WHERE at.mom_id = m.id) AS attachment_count,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', at.id,
                  'kind', at.kind,
                  'fileName', at.file_name,
                  'fileUrl', at.file_url,
                  'mimeType', at.mime_type,
                  'linkUrl', at.link_url,
                  'linkLabel', at.link_label
                ) ORDER BY at.position ASC, at.created_at ASC)
                FROM portal_mom_attachments at
                WHERE at.mom_id = m.id
              ), '[]'::json) AS attachments
         FROM portal_moms m
         LEFT JOIN projects p ON p.id = m.project_id
         ${where}
         ORDER BY m.meeting_date DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const projects = await pool.query(
      `SELECT DISTINCT p.id, p.name, p.code
         FROM portal_moms m
         JOIN projects p ON p.id = m.project_id
        WHERE m.tenant_id = $1 AND m.client_id = $2
          AND m.status = 'published' AND m.visibility = 'client'
        ORDER BY p.name ASC`,
      [ctx.tenantId, ctx.clientId],
    );

    res.json({
      success: true,
      data: list.rows.map((r) => ({
        id: r.id,
        momNumber: r.mom_number,
        title: r.title,
        meetingDate: r.meeting_date,
        durationMinutes: r.duration_minutes,
        projectId: r.project_id,
        projectName: r.project_name,
        recordingUrl: r.recording_url,
        summaryPreview: r.summary ? r.summary.slice(0, 220) : null,
        createdAt: r.created_at,
        actionCount: r.action_count || 0,
        openActionCount: r.open_action_count || 0,
        attendeeCount: r.attendee_count || 0,
        decisionCount: r.decision_count || 0,
        attachmentCount: r.attachment_count || 0,
        attachments: r.attachments || [],
      })),
      meta: { total, page, limit, projects: projects.rows },
    });
  }

  /** GET /api/client-portal/moms/:id */
  static async detail(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    const { id } = req.params;

    const m = await pool.query(
      `SELECT m.id, m.mom_number, m.title, m.meeting_date,
              m.duration_minutes, m.location, m.recording_url,
              m.summary, m.ai_summary, m.created_at, m.updated_at,
              m.project_id, p.name AS project_name, p.code AS project_code
         FROM portal_moms m
         LEFT JOIN projects p ON p.id = m.project_id
        WHERE m.id = $1 AND m.tenant_id = $2 AND m.client_id = $3
          AND m.status = 'published' AND m.visibility = 'client'`,
      [id, ctx.tenantId, ctx.clientId],
    );
    if (m.rowCount === 0) {
      res.status(404).json({ success: false, error: "MOM not found" });
      return;
    }
    const mom = m.rows[0];

    const [att, dec, ai, atch] = await Promise.all([
      pool.query(
        `SELECT id, name, email, role, party, position
           FROM portal_mom_attendees
          WHERE mom_id = $1 AND tenant_id = $2
          ORDER BY position ASC, name ASC`,
        [id, ctx.tenantId],
      ),
      pool.query(
        `SELECT id, decision, decided_by, position
           FROM portal_mom_decisions
          WHERE mom_id = $1 AND tenant_id = $2
          ORDER BY position ASC, created_at ASC`,
        [id, ctx.tenantId],
      ),
      pool.query(
        `SELECT ai.id, ai.text, ai.owner_name, ai.due_date, ai.status,
                ai.position, ai.converted_to_type, ai.converted_to_id,
                pt.ticket_number AS converted_ticket_number
           FROM portal_mom_action_items ai
           LEFT JOIN portal_tickets pt
                  ON ai.converted_to_type = 'portal_ticket'
                 AND pt.id = ai.converted_to_id
          WHERE ai.mom_id = $1 AND ai.tenant_id = $2
          ORDER BY ai.position ASC, ai.created_at ASC`,
        [id, ctx.tenantId],
      ),
      pool.query(
        `SELECT id, kind, file_name, file_url, file_size_bytes, mime_type,
                link_url, link_label, position
           FROM portal_mom_attachments
          WHERE mom_id = $1 AND tenant_id = $2
          ORDER BY position ASC, created_at ASC`,
        [id, ctx.tenantId],
      ),
    ]);

    res.json({
      success: true,
      data: {
        id: mom.id,
        momNumber: mom.mom_number,
        title: mom.title,
        meetingDate: mom.meeting_date,
        durationMinutes: mom.duration_minutes,
        location: mom.location,
        recordingUrl: mom.recording_url,
        summary: mom.summary,
        aiSummary: mom.ai_summary,
        createdAt: mom.created_at,
        updatedAt: mom.updated_at,
        project: mom.project_id
          ? {
              id: mom.project_id,
              name: mom.project_name,
              code: mom.project_code,
            }
          : null,
        attendees: att.rows,
        decisions: dec.rows,
        actionItems: ai.rows.map((r) => ({
          id: r.id,
          text: r.text,
          ownerName: r.owner_name,
          dueDate: r.due_date,
          status: r.status,
          position: r.position,
          convertedToType: r.converted_to_type,
          convertedTicketNumber: r.converted_ticket_number,
        })),
        attachments: atch.rows.map((a) => ({
          id: a.id,
          kind: a.kind,
          fileName: a.file_name,
          fileUrl: a.file_url,
          fileSizeBytes: a.file_size_bytes,
          mimeType: a.mime_type,
          linkUrl: a.link_url,
          linkLabel: a.link_label,
          position: a.position,
        })),
      },
    });
  }
}

export default ClientPortalMomController;
