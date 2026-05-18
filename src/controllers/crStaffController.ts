import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest } from "@/types";
import { allocateCrNumber, shapeCr } from "./clientPortalCrController";

const VALID_STATUSES = new Set([
  "draft",
  "submitted",
  "under_review",
  "estimated",
  "approved",
  "rejected",
  "scheduled",
  "in_progress",
  "delivered",
  "closed",
  "cancelled",
]);

/**
 * Staff-side CR management. Sits at /api/change-requests/* (and
 * /api/clients-v2/:clientId/change-requests for the per-client list+create).
 */
export class CrStaffController {
  /** GET /api/clients-v2/:clientId/change-requests */
  static async listForClient(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { clientId } = req.params;
    const r = await pool.query(
      `SELECT cr.id, cr.cr_number, cr.subject, cr.priority, cr.status,
              cr.estimated_hours_min, cr.estimated_hours_max,
              cr.estimated_cost, cr.estimated_currency,
              cr.target_delivery_date, cr.client_decision,
              cr.last_activity_at, cr.created_at,
              cr.project_id, p.name AS project_name,
              cr.linked_invoice_id, i.invoice_number AS linked_invoice_number,
              cr.linked_sprint_id, rp.version AS linked_sprint_version,
              cr.created_by_portal_user_id, cr.created_by_staff_user_id,
              cr.assigned_staff_user_id, u.name AS assigned_staff_name,
              (SELECT COUNT(*)::int FROM portal_cr_messages m
                WHERE m.cr_id = cr.id) AS message_count
         FROM portal_change_requests cr
         LEFT JOIN projects p ON p.id = cr.project_id
         LEFT JOIN invoices i ON i.id = cr.linked_invoice_id
         LEFT JOIN release_plans rp ON rp.id = cr.linked_sprint_id
         LEFT JOIN users u ON u.id = cr.assigned_staff_user_id
        WHERE cr.tenant_id = $1 AND cr.client_id = $2
        ORDER BY cr.last_activity_at DESC`,
      [tenantId, clientId],
    );
    res.json({
      success: true,
      data: r.rows.map((row) => ({
        id: row.id,
        crNumber: row.cr_number,
        subject: row.subject,
        priority: row.priority,
        status: row.status,
        estimatedHoursMin: row.estimated_hours_min,
        estimatedHoursMax: row.estimated_hours_max,
        estimatedCost: row.estimated_cost,
        estimatedCurrency: row.estimated_currency,
        targetDeliveryDate: row.target_delivery_date,
        clientDecision: row.client_decision,
        lastActivityAt: row.last_activity_at,
        createdAt: row.created_at,
        projectId: row.project_id,
        projectName: row.project_name,
        linkedInvoiceId: row.linked_invoice_id,
        linkedInvoiceNumber: row.linked_invoice_number,
        linkedSprintId: row.linked_sprint_id,
        linkedSprintVersion: row.linked_sprint_version,
        createdByPortalUserId: row.created_by_portal_user_id,
        createdByStaffUserId: row.created_by_staff_user_id,
        assignedStaffUserId: row.assigned_staff_user_id,
        assignedStaffName: row.assigned_staff_name,
        messageCount: row.message_count || 0,
      })),
    });
  }

  /**
   * POST /api/clients-v2/:clientId/change-requests
   * body: { subject, description, priority?, projectId?, status?,
   *         impactAnalysis?, estimatedHoursMin?, estimatedHoursMax?,
   *         estimatedCost?, estimatedCurrency?, targetDeliveryDate? }
   *
   * Staff can create a CR on behalf of a client (e.g. capturing one from a
   * call or email) and optionally provide the estimate inline so the client
   * sees it ready to approve.
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user?.id || null;
    const { clientId } = req.params;
    const b = req.body || {};

    if (!b.subject?.trim() || !b.description?.trim()) {
      res.status(400).json({
        success: false,
        error: "subject and description are required",
      });
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

    const status = b.status || "under_review"; // staff-created defaults here
    if (!VALID_STATUSES.has(status)) {
      res.status(400).json({ success: false, error: "Invalid status" });
      return;
    }

    const crNumber = await allocateCrNumber(tenantId);
    const ins = await pool.query(
      `INSERT INTO portal_change_requests
         (tenant_id, client_id, project_id, cr_number, subject, description,
          priority, status, impact_analysis,
          estimated_hours_min, estimated_hours_max, estimated_cost,
          estimated_currency, target_delivery_date,
          created_by_staff_user_id, assigned_staff_user_id,
          last_activity_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
       RETURNING id, cr_number, status`,
      [
        tenantId,
        clientId,
        b.projectId || null,
        crNumber,
        b.subject.trim(),
        b.description.trim(),
        (b.priority || "medium").toLowerCase(),
        status,
        b.impactAnalysis || null,
        b.estimatedHoursMin ?? null,
        b.estimatedHoursMax ?? null,
        b.estimatedCost ?? null,
        b.estimatedCurrency || null,
        b.targetDeliveryDate || null,
        userId,
        userId,
      ],
    );
    const cr = ins.rows[0];

    // Seed thread with staff-authored description
    await pool.query(
      `INSERT INTO portal_cr_messages
         (tenant_id, cr_id, author_type, staff_user_id, body)
       VALUES ($1, $2, 'staff', $3, $4)`,
      [tenantId, cr.id, userId, b.description.trim()],
    );

    res.status(201).json({
      success: true,
      data: { id: cr.id, crNumber: cr.cr_number, status: cr.status },
    });
  }

  /** GET /api/change-requests/:id (staff) */
  static async detail(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const crRes = await pool.query(
      `SELECT cr.*, p.name AS project_name, p.code AS project_code,
              u.name AS assigned_staff_name,
              i.invoice_number AS linked_invoice_number,
              rp.version AS linked_sprint_version,
              c.company_name AS client_name,
              cpu.display_name AS created_by_portal_name,
              cpu.email        AS created_by_portal_email,
              su.name          AS created_by_staff_name
         FROM portal_change_requests cr
         LEFT JOIN projects p ON p.id = cr.project_id
         LEFT JOIN users u ON u.id = cr.assigned_staff_user_id
         LEFT JOIN invoices i ON i.id = cr.linked_invoice_id
         LEFT JOIN release_plans rp ON rp.id = cr.linked_sprint_id
         LEFT JOIN clients_v2 c ON c.id = cr.client_id
         LEFT JOIN client_portal_users cpu ON cpu.id = cr.created_by_portal_user_id
         LEFT JOIN users su ON su.id = cr.created_by_staff_user_id
        WHERE cr.id = $1 AND cr.tenant_id = $2`,
      [id, tenantId],
    );
    const cr = crRes.rows[0];
    if (!cr) {
      res.status(404).json({ success: false, error: "Change request not found" });
      return;
    }

    const msgs = await pool.query(
      `SELECT m.*,
              pu.display_name AS portal_user_name,
              pu.email        AS portal_user_email,
              su.name         AS staff_user_name
         FROM portal_cr_messages m
         LEFT JOIN client_portal_users pu ON pu.id = m.portal_user_id
         LEFT JOIN users su ON su.id = m.staff_user_id
        WHERE m.cr_id = $1 AND m.tenant_id = $2
        ORDER BY m.created_at ASC`,
      [id, tenantId],
    );

    res.json({
      success: true,
      data: {
        ...shapeCr(cr, msgs.rows),
        clientId: cr.client_id,
        clientName: cr.client_name,
        createdByPortalName: cr.created_by_portal_name,
        createdByPortalEmail: cr.created_by_portal_email,
        createdByStaffName: cr.created_by_staff_name,
      },
    });
  }

  /**
   * PATCH /api/change-requests/:id/estimate
   * body: { impactAnalysis?, estimatedHoursMin?, estimatedHoursMax?,
   *         estimatedCost?, estimatedCurrency?, targetDeliveryDate?,
   *         publish?: boolean }
   *
   * When `publish` is true and the CR is in 'submitted'/'under_review',
   * flips status to 'estimated' (which is what the portal user needs to see
   * an approve/reject prompt).
   */
  static async updateEstimate(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user?.id || null;
    const { id } = req.params;
    const b = req.body || {};

    const cur = await pool.query(
      `SELECT status FROM portal_change_requests
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (cur.rowCount === 0) {
      res.status(404).json({ success: false, error: "Change request not found" });
      return;
    }
    const currentStatus = cur.rows[0].status;
    const shouldPublish =
      b.publish === true &&
      ["submitted", "under_review", "draft"].includes(currentStatus);

    const sets: string[] = [];
    const params: any[] = [];
    const push = (col: string, val: any) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (b.impactAnalysis !== undefined)
      push("impact_analysis", b.impactAnalysis || null);
    if (b.estimatedHoursMin !== undefined)
      push("estimated_hours_min", b.estimatedHoursMin ?? null);
    if (b.estimatedHoursMax !== undefined)
      push("estimated_hours_max", b.estimatedHoursMax ?? null);
    if (b.estimatedCost !== undefined)
      push("estimated_cost", b.estimatedCost ?? null);
    if (b.estimatedCurrency !== undefined)
      push("estimated_currency", b.estimatedCurrency || null);
    if (b.targetDeliveryDate !== undefined)
      push("target_delivery_date", b.targetDeliveryDate || null);

    if (sets.length === 0 && !shouldPublish) {
      res.status(400).json({ success: false, error: "Nothing to update" });
      return;
    }

    if (shouldPublish) {
      push("status", "estimated");
    }

    params.push(id);
    params.push(tenantId);
    await pool.query(
      `UPDATE portal_change_requests
          SET ${sets.join(", ")}, last_activity_at = NOW(), updated_at = NOW()
        WHERE id = $${params.length - 1} AND tenant_id = $${params.length}`,
      params,
    );

    await pool.query(
      `INSERT INTO portal_cr_messages
         (tenant_id, cr_id, author_type, staff_user_id, body,
          is_system_event, event_type, event_from, event_to, metadata)
       VALUES ($1, $2, 'system', $3, $4, TRUE, $5, $6, $7, $8::jsonb)`,
      [
        tenantId,
        id,
        userId,
        shouldPublish
          ? "Estimate published — awaiting client decision"
          : "Estimate updated",
        shouldPublish ? "estimate_published" : "estimate_updated",
        currentStatus,
        shouldPublish ? "estimated" : currentStatus,
        JSON.stringify({
          impactAnalysis: b.impactAnalysis,
          estimatedHoursMin: b.estimatedHoursMin,
          estimatedHoursMax: b.estimatedHoursMax,
          estimatedCost: b.estimatedCost,
          estimatedCurrency: b.estimatedCurrency,
          targetDeliveryDate: b.targetDeliveryDate,
        }),
      ],
    );

    res.json({ success: true });
  }

  /** PATCH /api/change-requests/:id/status  body: { status } */
  static async updateStatus(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user?.id || null;
    const { id } = req.params;
    const { status } = req.body || {};
    if (!VALID_STATUSES.has(status)) {
      res.status(400).json({ success: false, error: "Invalid status" });
      return;
    }
    const cur = await pool.query(
      `SELECT status FROM portal_change_requests
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (cur.rowCount === 0) {
      res.status(404).json({ success: false, error: "Change request not found" });
      return;
    }
    if (cur.rows[0].status === status) {
      res.json({ success: true, data: { id, status } });
      return;
    }
    await pool.query(
      `UPDATE portal_change_requests
          SET status = $1, last_activity_at = NOW(), updated_at = NOW()
        WHERE id = $2`,
      [status, id],
    );
    await pool.query(
      `INSERT INTO portal_cr_messages
         (tenant_id, cr_id, author_type, staff_user_id,
          is_system_event, event_type, event_from, event_to)
       VALUES ($1, $2, 'system', $3, TRUE, 'status_change', $4, $5)`,
      [tenantId, id, userId, cur.rows[0].status, status],
    );
    res.json({ success: true, data: { id, status } });
  }

  /**
   * PATCH /api/change-requests/:id/link
   * body: { invoiceId?: string|null, sprintId?: string|null }
   * Passing null clears the link. Logs a system event for each linkage change.
   */
  static async updateLinks(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user?.id || null;
    const { id } = req.params;
    const b = req.body || {};

    const cur = await pool.query(
      `SELECT linked_invoice_id, linked_sprint_id, status
         FROM portal_change_requests
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (cur.rowCount === 0) {
      res.status(404).json({ success: false, error: "Change request not found" });
      return;
    }
    const row = cur.rows[0];
    const sets: string[] = [];
    const params: any[] = [];
    const events: { type: string; from: string | null; to: string | null }[] = [];

    if (b.invoiceId !== undefined) {
      params.push(b.invoiceId || null);
      sets.push(`linked_invoice_id = $${params.length}`);
      events.push({
        type: "invoice_linked",
        from: row.linked_invoice_id,
        to: b.invoiceId || null,
      });
    }
    if (b.sprintId !== undefined) {
      params.push(b.sprintId || null);
      sets.push(`linked_sprint_id = $${params.length}`);
      events.push({
        type: "sprint_linked",
        from: row.linked_sprint_id,
        to: b.sprintId || null,
      });
      // Auto-bump to 'scheduled' when linking a sprint to an approved CR
      if (
        b.sprintId &&
        ["approved", "estimated"].includes(row.status)
      ) {
        params.push("scheduled");
        sets.push(`status = $${params.length}`);
        events.push({
          type: "status_change",
          from: row.status,
          to: "scheduled",
        });
      }
    }
    if (sets.length === 0) {
      res.status(400).json({ success: false, error: "Nothing to update" });
      return;
    }
    params.push(id);
    params.push(tenantId);
    await pool.query(
      `UPDATE portal_change_requests
          SET ${sets.join(", ")}, last_activity_at = NOW(), updated_at = NOW()
        WHERE id = $${params.length - 1} AND tenant_id = $${params.length}`,
      params,
    );
    for (const e of events) {
      await pool.query(
        `INSERT INTO portal_cr_messages
           (tenant_id, cr_id, author_type, staff_user_id,
            is_system_event, event_type, event_from, event_to)
         VALUES ($1, $2, 'system', $3, TRUE, $4, $5, $6)`,
        [tenantId, id, userId, e.type, e.from, e.to],
      );
    }
    res.json({ success: true });
  }

  /** PATCH /api/change-requests/:id/assign  body: { userId } */
  static async assign(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const me = req.user?.id || null;
    const { id } = req.params;
    const { userId } = req.body || {};
    const cur = await pool.query(
      `SELECT assigned_staff_user_id FROM portal_change_requests
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (cur.rowCount === 0) {
      res.status(404).json({ success: false, error: "Change request not found" });
      return;
    }
    await pool.query(
      `UPDATE portal_change_requests
          SET assigned_staff_user_id = $1,
              last_activity_at = NOW(), updated_at = NOW()
        WHERE id = $2`,
      [userId || null, id],
    );
    await pool.query(
      `INSERT INTO portal_cr_messages
         (tenant_id, cr_id, author_type, staff_user_id,
          is_system_event, event_type, event_from, event_to)
       VALUES ($1, $2, 'system', $3, TRUE, 'assignment', $4, $5)`,
      [
        tenantId,
        id,
        me,
        cur.rows[0].assigned_staff_user_id || null,
        userId || null,
      ],
    );
    res.json({ success: true });
  }

  /** POST /api/change-requests/:id/messages  body: { body } */
  static async reply(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user?.id || null;
    const { id } = req.params;
    const { body } = req.body || {};
    if (!body || !body.trim()) {
      res.status(400).json({ success: false, error: "body is required" });
      return;
    }
    const t = await pool.query(
      `SELECT 1 FROM portal_change_requests
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (t.rowCount === 0) {
      res.status(404).json({ success: false, error: "Change request not found" });
      return;
    }
    const ins = await pool.query(
      `INSERT INTO portal_cr_messages
         (tenant_id, cr_id, author_type, staff_user_id, body)
       VALUES ($1, $2, 'staff', $3, $4)
       RETURNING id, created_at`,
      [tenantId, id, userId, body.trim()],
    );
    await pool.query(
      `UPDATE portal_change_requests
          SET last_activity_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [id],
    );
    res.status(201).json({ success: true, data: ins.rows[0] });
  }
}

export default CrStaffController;
