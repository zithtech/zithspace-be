import { Request, Response } from "express";
import { nanoid } from "nanoid";
import pool from "@/config/dbpool";
import { s3Client, BUCKET_NAME } from "@/utils/r2Client";
import { PutObjectCommand } from "@aws-sdk/client-s3";

/* ---------------------------------------------------------------------- */
/*  Helpers — kept in sync with clientPortalTicketController where possible */
/* ---------------------------------------------------------------------- */

const VALID_PRIORITIES = new Set(["low", "medium", "high", "critical"]);

interface Attachment {
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
}

async function uploadAttachments(
  tenantId: string,
  crIdOrNew: string,
  files: { dataUrl: string; fileName: string }[],
): Promise<Attachment[]> {
  const out: Attachment[] = [];
  for (const f of files) {
    const match = f.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) continue;
    const contentType = match[1];
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > 10 * 1024 * 1024) {
      throw new Error(`Attachment ${f.fileName} exceeds 10 MB`);
    }
    const safeName =
      (f.fileName || `file_${Date.now()}`).replace(/[^a-zA-Z0-9.-]/g, "_") ||
      "file";
    const uniqueId = nanoid(12);
    const key = `${tenantId}/client-portal/change-requests/${crIdOrNew}/${uniqueId}_${safeName}`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "private, max-age=0, no-store",
        ContentDisposition: `attachment; filename="${safeName}"`,
      }),
    );
    const publicBase =
      process.env.CF_R2_PUBLIC_URL &&
      !process.env.CF_R2_PUBLIC_URL.includes("r2.cloudflarestorage.com")
        ? process.env.CF_R2_PUBLIC_URL.replace(/\/$/, "")
        : "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
    out.push({
      fileName: safeName,
      fileUrl: `${publicBase}/${key}`,
      fileSize: buffer.length,
      mimeType: contentType,
    });
  }
  return out;
}

export async function allocateCrNumber(tenantId: string): Promise<string> {
  const r = await pool.query(
    `INSERT INTO portal_cr_counters (tenant_id, last_seq)
     VALUES ($1, 1)
     ON CONFLICT (tenant_id) DO UPDATE
       SET last_seq = portal_cr_counters.last_seq + 1
     RETURNING last_seq`,
    [tenantId],
  );
  return `CR-${String(r.rows[0].last_seq).padStart(6, "0")}`;
}

/* ---------------------------------------------------------------------- */

export class ClientPortalCrController {
  /**
   * GET /api/client-portal/change-requests?status=&search=&projectId=&from=&to=&page=&limit=
   * `from`/`to` are ISO dates (YYYY-MM-DD); they filter on the target delivery
   * date when present, falling back to the CR creation date.
   */
  static async list(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    const status = ((req.query.status as string) || "").toLowerCase();
    const search = ((req.query.search as string) || "").trim();
    const projectFilter = ((req.query.projectId as string) || "").trim();
    const priority = ((req.query.priority as string) || "").toLowerCase();
    const fromRaw = ((req.query.from as string) || "").trim();
    const toRaw = ((req.query.to as string) || "").trim();
    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    const from = isoDate.test(fromRaw) ? fromRaw : "";
    const to = isoDate.test(toRaw) ? toRaw : "";
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
    );
    const offset = (page - 1) * limit;

    const params: any[] = [ctx.tenantId, ctx.clientId];
    let where = `WHERE cr.tenant_id = $1 AND cr.client_id = $2
                   AND cr.status <> 'draft'`;
    if (status && status !== "all") {
      params.push(status);
      where += ` AND cr.status = $${params.length}`;
    }
    if (priority && VALID_PRIORITIES.has(priority)) {
      params.push(priority);
      where += ` AND cr.priority = $${params.length}`;
    }
    if (projectFilter) {
      params.push(projectFilter);
      where += ` AND cr.project_id = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (cr.subject ILIKE $${params.length}
                  OR cr.cr_number ILIKE $${params.length})`;
    }
    if (from) {
      params.push(from);
      where += ` AND COALESCE(cr.target_delivery_date, cr.created_at::date)
                   >= $${params.length}::date`;
    }
    if (to) {
      params.push(to);
      where += ` AND COALESCE(cr.target_delivery_date, cr.created_at::date)
                   <= $${params.length}::date`;
    }

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM portal_change_requests cr ${where}`,
      params,
    );
    const total = countRes.rows[0]?.n || 0;

    params.push(limit);
    params.push(offset);

    const list = await pool.query(
      `SELECT cr.id, cr.cr_number, cr.subject, cr.priority, cr.status,
              cr.estimated_hours_min, cr.estimated_hours_max,
              cr.estimated_cost, cr.estimated_currency,
              cr.target_delivery_date, cr.client_decision,
              cr.last_activity_at, cr.created_at,
              cr.project_id, p.name AS project_name,
              cr.linked_invoice_id, i.invoice_number AS linked_invoice_number,
              (SELECT COUNT(*)::int FROM portal_cr_messages m
                WHERE m.cr_id = cr.id) AS message_count
         FROM portal_change_requests cr
         LEFT JOIN projects p ON p.id = cr.project_id
         LEFT JOIN invoices i ON i.id = cr.linked_invoice_id
         ${where}
         ORDER BY cr.last_activity_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    // Status counts for filter pills
    const counts = await pool.query(
      `SELECT status, COUNT(*)::int AS n
         FROM portal_change_requests
        WHERE tenant_id = $1 AND client_id = $2 AND status <> 'draft'
        GROUP BY status`,
      [ctx.tenantId, ctx.clientId],
    );
    const countMap: Record<string, number> = {};
    for (const row of counts.rows) countMap[row.status] = row.n;

    // Distinct projects across this client's CRs for the FE filter dropdown
    const projectsRes = await pool.query(
      `SELECT DISTINCT p.id, p.name, p.code
         FROM portal_change_requests cr
         JOIN projects p ON p.id = cr.project_id
        WHERE cr.tenant_id = $1
          AND cr.client_id = $2
          AND cr.status <> 'draft'
          AND p.name IS NOT NULL
        ORDER BY p.name ASC`,
      [ctx.tenantId, ctx.clientId],
    );

    res.json({
      success: true,
      data: list.rows.map((row) => ({
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
        messageCount: row.message_count || 0,
      })),
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
   * POST /api/client-portal/change-requests
   * body: { subject, description, priority?, projectId?, attachments? }
   */
  static async create(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    const { subject, description, priority, projectId, attachments } =
      req.body || {};
    if (!subject || typeof subject !== "string" || !subject.trim()) {
      res.status(400).json({ success: false, error: "subject is required" });
      return;
    }
    if (!description || typeof description !== "string" || !description.trim()) {
      res
        .status(400)
        .json({ success: false, error: "description is required" });
      return;
    }
    const pri = (priority || "medium").toLowerCase();
    if (!VALID_PRIORITIES.has(pri)) {
      res.status(400).json({ success: false, error: "Invalid priority" });
      return;
    }

    if (projectId) {
      const ok = await pool.query(
        `SELECT 1 FROM client_projects
          WHERE tenant_id = $1 AND client_id = $2 AND project_id = $3`,
        [ctx.tenantId, ctx.clientId, projectId],
      );
      if (ok.rowCount === 0) {
        res.status(400).json({
          success: false,
          error: "projectId is not linked to your account",
        });
        return;
      }
    }

    const crNumber = await allocateCrNumber(ctx.tenantId);

    const ins = await pool.query(
      `INSERT INTO portal_change_requests
         (tenant_id, client_id, project_id, cr_number, subject, description,
          priority, status, created_by_portal_user_id, last_activity_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted', $8, NOW())
       RETURNING id, cr_number, subject, priority, status, created_at`,
      [
        ctx.tenantId,
        ctx.clientId,
        projectId || null,
        crNumber,
        subject.trim(),
        description.trim(),
        pri,
        ctx.portalUserId,
      ],
    );
    const cr = ins.rows[0];

    let uploaded: Attachment[] = [];
    if (Array.isArray(attachments) && attachments.length > 0) {
      try {
        uploaded = await uploadAttachments(ctx.tenantId, cr.id, attachments);
      } catch (err: any) {
        await pool.query(
          `INSERT INTO portal_cr_messages
             (tenant_id, cr_id, author_type, body, is_system_event,
              event_type)
           VALUES ($1, $2, 'system', $3, TRUE, 'attachment_upload_failed')`,
          [ctx.tenantId, cr.id, err?.message || "Upload error"],
        );
      }
    }

    // Seed the thread with the initial description as the first portal message
    await pool.query(
      `INSERT INTO portal_cr_messages
         (tenant_id, cr_id, author_type, portal_user_id, body, attachments)
       VALUES ($1, $2, 'portal', $3, $4, $5::jsonb)`,
      [
        ctx.tenantId,
        cr.id,
        ctx.portalUserId,
        description.trim(),
        JSON.stringify(uploaded),
      ],
    );

    res.status(201).json({
      success: true,
      data: {
        id: cr.id,
        crNumber: cr.cr_number,
        subject: cr.subject,
        priority: cr.priority,
        status: cr.status,
        createdAt: cr.created_at,
      },
    });
  }

  /** GET /api/client-portal/change-requests/:id */
  static async detail(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    const { id } = req.params;

    const crRes = await pool.query(
      `SELECT cr.*, p.name AS project_name, p.code AS project_code,
              u.name AS assigned_staff_name,
              i.invoice_number AS linked_invoice_number,
              rp.version AS linked_sprint_version
         FROM portal_change_requests cr
         LEFT JOIN projects p ON p.id = cr.project_id
         LEFT JOIN users u ON u.id = cr.assigned_staff_user_id
         LEFT JOIN invoices i ON i.id = cr.linked_invoice_id
         LEFT JOIN release_plans rp ON rp.id = cr.linked_sprint_id
        WHERE cr.id = $1 AND cr.tenant_id = $2 AND cr.client_id = $3
          AND cr.status <> 'draft'`,
      [id, ctx.tenantId, ctx.clientId],
    );
    const cr = crRes.rows[0];
    if (!cr) {
      res.status(404).json({ success: false, error: "Change request not found" });
      return;
    }

    const msgs = await pool.query(
      `SELECT m.id, m.author_type, m.portal_user_id, m.staff_user_id,
              m.body, m.attachments, m.is_system_event, m.event_type,
              m.event_from, m.event_to, m.metadata, m.created_at,
              pu.display_name AS portal_user_name,
              pu.email        AS portal_user_email,
              su.name         AS staff_user_name
         FROM portal_cr_messages m
         LEFT JOIN client_portal_users pu ON pu.id = m.portal_user_id
         LEFT JOIN users su ON su.id = m.staff_user_id
        WHERE m.cr_id = $1 AND m.tenant_id = $2
        ORDER BY m.created_at ASC`,
      [id, ctx.tenantId],
    );

    res.json({ success: true, data: shapeCr(cr, msgs.rows) });
  }

  /**
   * POST /api/client-portal/change-requests/:id/messages
   * body: { body, attachments? }
   */
  static async reply(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    const { id } = req.params;
    const { body, attachments } = req.body || {};
    if (!body || typeof body !== "string" || !body.trim()) {
      res.status(400).json({ success: false, error: "body is required" });
      return;
    }
    const cr = await pool.query(
      `SELECT status FROM portal_change_requests
        WHERE id = $1 AND tenant_id = $2 AND client_id = $3`,
      [id, ctx.tenantId, ctx.clientId],
    );
    if (cr.rowCount === 0) {
      res.status(404).json({ success: false, error: "Change request not found" });
      return;
    }
    if (["closed", "cancelled", "delivered"].includes(cr.rows[0].status)) {
      res
        .status(409)
        .json({ success: false, error: "This CR is no longer accepting replies." });
      return;
    }

    let uploaded: Attachment[] = [];
    if (Array.isArray(attachments) && attachments.length > 0) {
      uploaded = await uploadAttachments(ctx.tenantId, id, attachments);
    }

    const ins = await pool.query(
      `INSERT INTO portal_cr_messages
         (tenant_id, cr_id, author_type, portal_user_id, body, attachments)
       VALUES ($1, $2, 'portal', $3, $4, $5::jsonb)
       RETURNING id, created_at`,
      [
        ctx.tenantId,
        id,
        ctx.portalUserId,
        body.trim(),
        JSON.stringify(uploaded),
      ],
    );

    await pool.query(
      `UPDATE portal_change_requests
          SET last_activity_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [id],
    );

    res.status(201).json({
      success: true,
      data: { id: ins.rows[0].id, createdAt: ins.rows[0].created_at, attachments: uploaded },
    });
  }

  /**
   * POST /api/client-portal/change-requests/:id/decision
   * body: { decision: 'approved' | 'rejected', note? }
   *
   * Only valid when status='estimated'. Approval flips status to 'approved',
   * rejection to 'rejected'. Records both as a system event and (when the
   * client adds a note) as a portal message.
   */
  static async decide(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    const { id } = req.params;
    const { decision, note } = req.body || {};
    if (decision !== "approved" && decision !== "rejected") {
      res.status(400).json({
        success: false,
        error: "decision must be 'approved' or 'rejected'",
      });
      return;
    }
    const cr = await pool.query(
      `SELECT status, client_decision FROM portal_change_requests
        WHERE id = $1 AND tenant_id = $2 AND client_id = $3`,
      [id, ctx.tenantId, ctx.clientId],
    );
    if (cr.rowCount === 0) {
      res.status(404).json({ success: false, error: "Change request not found" });
      return;
    }
    if (cr.rows[0].client_decision) {
      res.status(409).json({
        success: false,
        error: `Already ${cr.rows[0].client_decision}`,
      });
      return;
    }
    if (cr.rows[0].status !== "estimated") {
      res.status(409).json({
        success: false,
        error: "Estimate is not ready to approve.",
      });
      return;
    }

    const newStatus = decision === "approved" ? "approved" : "rejected";

    await pool.query(
      `UPDATE portal_change_requests
          SET client_decision = $1,
              client_decision_at = NOW(),
              client_decision_by_portal_id = $2,
              client_decision_note = $3,
              status = $4,
              last_activity_at = NOW(),
              updated_at = NOW()
        WHERE id = $5`,
      [decision, ctx.portalUserId, note || null, newStatus, id],
    );

    await pool.query(
      `INSERT INTO portal_cr_messages
         (tenant_id, cr_id, author_type, portal_user_id,
          body, is_system_event, event_type, event_from, event_to)
       VALUES ($1, $2, 'system', $3, $4, TRUE, 'client_decision', 'estimated', $5)`,
      [
        ctx.tenantId,
        id,
        ctx.portalUserId,
        decision === "approved"
          ? "Client approved the estimate"
          : "Client rejected the estimate",
        newStatus,
      ],
    );
    if (note && note.trim()) {
      await pool.query(
        `INSERT INTO portal_cr_messages
           (tenant_id, cr_id, author_type, portal_user_id, body)
         VALUES ($1, $2, 'portal', $3, $4)`,
        [ctx.tenantId, id, ctx.portalUserId, note.trim()],
      );
    }

    res.json({ success: true, data: { id, status: newStatus, clientDecision: decision } });
  }

  /** GET /api/client-portal/change-requests/options/projects */
  static async projectOptions(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    const r = await pool.query(
      `SELECT p.id, p.name, p.code
         FROM client_projects cp
         JOIN projects p ON p.id = cp.project_id
        WHERE cp.tenant_id = $1 AND cp.client_id = $2
        ORDER BY p.name ASC`,
      [ctx.tenantId, ctx.clientId],
    );
    res.json({ success: true, data: r.rows });
  }
}

/**
 * Shared row shaper used by both portal and staff detail endpoints.
 * `extras` lets the caller pass already-joined names without re-querying.
 */
export function shapeCr(cr: any, messages: any[], extras: any = {}) {
  return {
    id: cr.id,
    crNumber: cr.cr_number,
    subject: cr.subject,
    description: cr.description,
    priority: cr.priority,
    status: cr.status,
    impactAnalysis: cr.impact_analysis,
    estimatedHoursMin: cr.estimated_hours_min,
    estimatedHoursMax: cr.estimated_hours_max,
    estimatedCost: cr.estimated_cost,
    estimatedCurrency: cr.estimated_currency,
    targetDeliveryDate: cr.target_delivery_date,
    clientDecision: cr.client_decision,
    clientDecisionAt: cr.client_decision_at,
    clientDecisionNote: cr.client_decision_note,
    projectId: cr.project_id,
    projectName: cr.project_name || extras.projectName || null,
    projectCode: cr.project_code || extras.projectCode || null,
    linkedInvoiceId: cr.linked_invoice_id,
    linkedInvoiceNumber: cr.linked_invoice_number || extras.linkedInvoiceNumber || null,
    linkedSprintId: cr.linked_sprint_id,
    linkedSprintVersion: cr.linked_sprint_version || extras.linkedSprintVersion || null,
    sourceMomActionItemId: cr.source_mom_action_item_id,
    assignedStaffUserId: cr.assigned_staff_user_id,
    assignedStaffName: cr.assigned_staff_name || extras.assignedStaffName || null,
    createdByPortalUserId: cr.created_by_portal_user_id,
    createdByStaffUserId: cr.created_by_staff_user_id,
    lastActivityAt: cr.last_activity_at,
    createdAt: cr.created_at,
    updatedAt: cr.updated_at,
    messages: messages.map((m) => ({
      id: m.id,
      authorType: m.author_type,
      portalUserId: m.portal_user_id,
      staffUserId: m.staff_user_id,
      portalUserName: m.portal_user_name,
      portalUserEmail: m.portal_user_email,
      staffUserName: m.staff_user_name,
      body: m.body,
      attachments: m.attachments || [],
      isSystemEvent: m.is_system_event,
      eventType: m.event_type,
      eventFrom: m.event_from,
      eventTo: m.event_to,
      metadata: m.metadata || null,
      createdAt: m.created_at,
    })),
  };
}

export default ClientPortalCrController;
