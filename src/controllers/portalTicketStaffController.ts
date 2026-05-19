import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest } from "@/types";

const VALID_STATUSES = new Set([
  "new",
  "in_review",
  "in_progress",
  "waiting_on_client",
  "resolved",
  "closed",
]);

const VALID_CATEGORIES = new Set([
  "bug",
  "enhancement",
  "support",
  "infra",
  "access",
  "other",
]);
const VALID_PRIORITIES = new Set(["low", "medium", "high", "critical"]);

const SLA_DEFAULTS: Record<string, { response: number; resolution: number }> = {
  critical: { response: 60, resolution: 8 * 60 },
  high: { response: 4 * 60, resolution: 24 * 60 },
  medium: { response: 8 * 60, resolution: 3 * 24 * 60 },
  low: { response: 24 * 60, resolution: 7 * 24 * 60 },
};

async function allocateTicketNumber(tenantId: string): Promise<string> {
  const r = await pool.query(
    `INSERT INTO portal_ticket_counters (tenant_id, last_seq)
     VALUES ($1, 1)
     ON CONFLICT (tenant_id) DO UPDATE
       SET last_seq = portal_ticket_counters.last_seq + 1
     RETURNING last_seq`,
    [tenantId],
  );
  const seq = r.rows[0].last_seq as number;
  return `PT-${String(seq).padStart(6, "0")}`;
}

/**
 * Staff-side endpoints for `portal_tickets`. Lives under
 * `/api/portal-tickets/*` (note: distinct prefix from `/api/client-portal/*`
 * which is portal-user-authenticated only). Lets staff list, view, reply,
 * change status and assign — the minimum needed for the conversation cycle
 * to work end-to-end.
 *
 * A full staff UI tab is out of scope for this commit.
 */
export class PortalTicketStaffController {
  /**
   * GET /api/portal-tickets?clientId=&status=&assignedToMe=&search=&page=&limit=
   */
  static async list(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user!.id;
    const { clientId, status, search } = req.query as Record<string, string>;
    const assignedToMe = (req.query.assignedToMe as string) === "true";
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
    );
    const offset = (page - 1) * limit;

    const params: any[] = [tenantId];
    let where = `WHERE t.tenant_id = $1`;
    if (clientId) {
      params.push(clientId);
      where += ` AND t.client_id = $${params.length}`;
    }
    if (status && status !== "all") {
      params.push(status);
      where += ` AND t.status = $${params.length}`;
    }
    if (assignedToMe) {
      params.push(userId);
      where += ` AND t.assigned_staff_user_id = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (t.subject ILIKE $${params.length}
                  OR t.ticket_number ILIKE $${params.length})`;
    }

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM portal_tickets t ${where}`,
      params,
    );
    const total = countRes.rows[0]?.n || 0;

    params.push(limit);
    params.push(offset);

    const list = await pool.query(
      `SELECT t.id, t.ticket_number, t.subject, t.category, t.priority,
              t.status, t.client_id, t.project_id, t.due_date,
              t.first_response_at, t.resolved_at, t.closed_at,
              t.last_activity_at, t.created_at,
              t.assigned_staff_user_id,
              c.company_name AS client_name,
              p.name         AS project_name,
              u.name         AS assigned_staff_name,
              (SELECT COUNT(*)::int FROM portal_ticket_messages m
                WHERE m.ticket_id = t.id) AS message_count
         FROM portal_tickets t
         LEFT JOIN clients_v2 c ON c.id = t.client_id
         LEFT JOIN projects p ON p.id = t.project_id
         LEFT JOIN users u ON u.id = t.assigned_staff_user_id
         ${where}
         ORDER BY t.last_activity_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({
      success: true,
      data: list.rows.map((row) => ({
        id: row.id,
        ticketNumber: row.ticket_number,
        subject: row.subject,
        category: row.category,
        priority: row.priority,
        status: row.status,
        clientId: row.client_id,
        clientName: row.client_name,
        projectId: row.project_id,
        projectName: row.project_name,
        assignedStaffUserId: row.assigned_staff_user_id,
        assignedStaffName: row.assigned_staff_name,
        dueDate: row.due_date,
        firstResponseAt: row.first_response_at,
        resolvedAt: row.resolved_at,
        closedAt: row.closed_at,
        lastActivityAt: row.last_activity_at,
        messageCount: row.message_count || 0,
        createdAt: row.created_at,
      })),
      meta: { total, page, limit },
    });
  }

  /** GET /api/portal-tickets/:id  (reuses portal detail shape) */
  static async detail(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { id } = req.params;

    const ticketRes = await pool.query(
      `SELECT t.*, c.company_name AS client_name, p.name AS project_name,
              u.name AS assigned_staff_name
         FROM portal_tickets t
         LEFT JOIN clients_v2 c ON c.id = t.client_id
         LEFT JOIN projects p ON p.id = t.project_id
         LEFT JOIN users u ON u.id = t.assigned_staff_user_id
        WHERE t.id = $1 AND t.tenant_id = $2`,
      [id, tenantId],
    );
    const ticket = ticketRes.rows[0];
    if (!ticket) {
      res.status(404).json({ success: false, error: "Ticket not found" });
      return;
    }

    const messagesRes = await pool.query(
      `SELECT m.id, m.author_type, m.portal_user_id, m.staff_user_id,
              m.body, m.attachments, m.is_system_event, m.event_type,
              m.event_from, m.event_to, m.created_at,
              pu.display_name AS portal_user_name,
              pu.email        AS portal_user_email,
              su.name         AS staff_user_name
         FROM portal_ticket_messages m
         LEFT JOIN client_portal_users pu ON pu.id = m.portal_user_id
         LEFT JOIN users su ON su.id = m.staff_user_id
        WHERE m.ticket_id = $1 AND m.tenant_id = $2
        ORDER BY m.created_at ASC`,
      [id, tenantId],
    );

    res.json({
      success: true,
      data: {
        ...ticket,
        clientName: ticket.client_name,
        projectName: ticket.project_name,
        assignedStaffName: ticket.assigned_staff_name,
        messages: messagesRes.rows,
      },
    });
  }

  /** POST /api/portal-tickets/:id/messages  body: { body } */
  static async reply(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user!.id;
    const { id } = req.params;
    const { body } = req.body || {};
    if (!body || typeof body !== "string" || !body.trim()) {
      res.status(400).json({ success: false, error: "body is required" });
      return;
    }
    const t = await pool.query(
      `SELECT status, first_response_at FROM portal_tickets
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (t.rowCount === 0) {
      res.status(404).json({ success: false, error: "Ticket not found" });
      return;
    }

    const inserted = await pool.query(
      `INSERT INTO portal_ticket_messages
         (tenant_id, ticket_id, author_type, staff_user_id, body)
       VALUES ($1, $2, 'staff', $3, $4)
       RETURNING id, created_at`,
      [tenantId, id, userId, body.trim()],
    );

    // Bookkeeping: stamp first_response_at on first staff message; flip
    // status from new → in_progress if needed; touch last_activity.
    const stampFirstResponse = !t.rows[0].first_response_at;
    const flipToInProgress = ["new", "in_review"].includes(t.rows[0].status);

    if (stampFirstResponse || flipToInProgress) {
      await pool.query(
        `UPDATE portal_tickets
            SET first_response_at = COALESCE(first_response_at, NOW()),
                status = CASE WHEN $1::bool THEN 'in_progress' ELSE status END,
                last_activity_at = NOW(),
                updated_at = NOW()
          WHERE id = $2`,
        [flipToInProgress, id],
      );
      if (flipToInProgress) {
        await pool.query(
          `INSERT INTO portal_ticket_messages
             (tenant_id, ticket_id, author_type, body, is_system_event,
              event_type, event_from, event_to)
           VALUES ($1, $2, 'system', NULL, TRUE, 'status_change',
                   $3, 'in_progress')`,
          [tenantId, id, t.rows[0].status],
        );
      }
    } else {
      await pool.query(
        `UPDATE portal_tickets
            SET last_activity_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [id],
      );
    }

    res.status(201).json({ success: true, data: inserted.rows[0] });
  }

  /** PATCH /api/portal-tickets/:id/status  body: { status } */
  static async updateStatus(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const { status } = req.body || {};
    if (!status || !VALID_STATUSES.has(status)) {
      res.status(400).json({ success: false, error: "Invalid status" });
      return;
    }
    const cur = await pool.query(
      `SELECT status FROM portal_tickets WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (cur.rowCount === 0) {
      res.status(404).json({ success: false, error: "Ticket not found" });
      return;
    }
    if (cur.rows[0].status === status) {
      res.json({ success: true, data: { id, status } });
      return;
    }

    await pool.query(
      `UPDATE portal_tickets
          SET status = $1,
              resolved_at = CASE WHEN $1 = 'resolved' THEN NOW()
                                 ELSE resolved_at END,
              closed_at   = CASE WHEN $1 = 'closed'   THEN NOW()
                                 ELSE closed_at   END,
              last_activity_at = NOW(),
              updated_at = NOW()
        WHERE id = $2`,
      [status, id],
    );
    await pool.query(
      `INSERT INTO portal_ticket_messages
         (tenant_id, ticket_id, author_type, body, is_system_event,
          event_type, event_from, event_to)
       VALUES ($1, $2, 'system', NULL, TRUE, 'status_change', $3, $4)`,
      [tenantId, id, cur.rows[0].status, status],
    );

    res.json({ success: true, data: { id, status } });
  }

  /**
   * POST /api/portal-tickets
   * Staff-created ticket on behalf of a client.
   * body: { clientId, subject, body, category?, priority?, projectId?,
   *         assignedStaffUserId? }
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user!.id;
    const {
      clientId,
      subject,
      body,
      category,
      priority,
      projectId,
      assignedStaffUserId,
    } = req.body || {};

    if (!clientId || typeof clientId !== "string") {
      res.status(400).json({ success: false, error: "clientId is required" });
      return;
    }
    if (!subject || typeof subject !== "string" || !subject.trim()) {
      res.status(400).json({ success: false, error: "subject is required" });
      return;
    }
    if (!body || typeof body !== "string" || !body.trim()) {
      res.status(400).json({ success: false, error: "body is required" });
      return;
    }
    const cat = (category || "support").toLowerCase();
    const pri = (priority || "medium").toLowerCase();
    if (!VALID_CATEGORIES.has(cat)) {
      res.status(400).json({ success: false, error: "Invalid category" });
      return;
    }
    if (!VALID_PRIORITIES.has(pri)) {
      res.status(400).json({ success: false, error: "Invalid priority" });
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
    if (projectId) {
      const ok = await pool.query(
        `SELECT 1 FROM client_projects
          WHERE tenant_id = $1 AND client_id = $2 AND project_id = $3`,
        [tenantId, clientId, projectId],
      );
      if (ok.rowCount === 0) {
        res.status(400).json({
          success: false,
          error: "projectId is not linked to this client",
        });
        return;
      }
    }

    const sla = SLA_DEFAULTS[pri] || SLA_DEFAULTS.medium;
    const ticketNumber = await allocateTicketNumber(tenantId);
    const assignedTo = assignedStaffUserId || userId;

    const insertRes = await pool.query(
      `INSERT INTO portal_tickets
         (tenant_id, client_id, ticket_number, subject, category, priority,
          status, project_id, assigned_staff_user_id,
          sla_response_target_minutes, sla_resolution_target_minutes,
          last_activity_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'new', $7, $8, $9, $10, NOW())
       RETURNING id, ticket_number, subject, category, priority, status,
                 created_at`,
      [
        tenantId,
        clientId,
        ticketNumber,
        subject.trim(),
        cat,
        pri,
        projectId || null,
        assignedTo,
        sla.response,
        sla.resolution,
      ],
    );
    const ticket = insertRes.rows[0];

    await pool.query(
      `INSERT INTO portal_ticket_messages
         (tenant_id, ticket_id, author_type, staff_user_id, body)
       VALUES ($1, $2, 'staff', $3, $4)`,
      [tenantId, ticket.id, userId, body.trim()],
    );

    res.status(201).json({
      success: true,
      data: {
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.created_at,
      },
    });
  }

  /** PATCH /api/portal-tickets/:id/assign  body: { userId } */
  static async assign(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const { userId } = req.body || {};
    const cur = await pool.query(
      `SELECT assigned_staff_user_id FROM portal_tickets
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (cur.rowCount === 0) {
      res.status(404).json({ success: false, error: "Ticket not found" });
      return;
    }
    await pool.query(
      `UPDATE portal_tickets
          SET assigned_staff_user_id = $1,
              last_activity_at = NOW(),
              updated_at = NOW()
        WHERE id = $2`,
      [userId || null, id],
    );
    await pool.query(
      `INSERT INTO portal_ticket_messages
         (tenant_id, ticket_id, author_type, body, is_system_event,
          event_type, event_from, event_to)
       VALUES ($1, $2, 'system', NULL, TRUE, 'assignment',
               $3, $4)`,
      [tenantId, id, cur.rows[0].assigned_staff_user_id || null, userId || null],
    );
    res.json({ success: true });
  }
}

export default PortalTicketStaffController;
