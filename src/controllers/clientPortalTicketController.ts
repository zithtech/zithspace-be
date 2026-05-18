import { Request, Response } from "express";
import { nanoid } from "nanoid";
import pool from "@/config/dbpool";
import { s3Client, BUCKET_NAME } from "@/utils/r2Client";
import { PutObjectCommand } from "@aws-sdk/client-s3";

const VALID_CATEGORIES = new Set([
  "bug",
  "enhancement",
  "support",
  "infra",
  "access",
  "other",
]);
const VALID_PRIORITIES = new Set(["low", "medium", "high", "critical"]);

// SLA defaults in minutes. These are the response/resolution targets we set
// on creation so the FE can show a live countdown. Staff can override later
// via the admin endpoint.
const SLA_DEFAULTS: Record<string, { response: number; resolution: number }> = {
  critical: { response: 60, resolution: 8 * 60 },
  high: { response: 4 * 60, resolution: 24 * 60 },
  medium: { response: 8 * 60, resolution: 3 * 24 * 60 },
  low: { response: 24 * 60, resolution: 7 * 24 * 60 },
};

/* ---------------------------------------------------------------------- */

interface Attachment {
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
}

async function uploadAttachments(
  tenantId: string,
  ticketIdOrNew: string,
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
    const key = `${tenantId}/client-portal/tickets/${ticketIdOrNew}/${uniqueId}_${safeName}`;
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

function decorateSla(row: any) {
  const now = Date.now();
  const created = new Date(row.created_at).getTime();
  let firstResponseBreached = false;
  let resolutionBreached = false;
  let firstResponseDueAt: Date | null = null;
  let resolutionDueAt: Date | null = null;
  if (row.sla_response_target_minutes) {
    firstResponseDueAt = new Date(
      created + row.sla_response_target_minutes * 60 * 1000,
    );
    const actual = row.first_response_at
      ? new Date(row.first_response_at).getTime()
      : now;
    firstResponseBreached = actual > firstResponseDueAt.getTime();
  }
  if (row.sla_resolution_target_minutes) {
    resolutionDueAt = new Date(
      created + row.sla_resolution_target_minutes * 60 * 1000,
    );
    const actual = row.resolved_at
      ? new Date(row.resolved_at).getTime()
      : now;
    resolutionBreached =
      !row.resolved_at && now > resolutionDueAt.getTime()
        ? true
        : !!row.resolved_at && actual > resolutionDueAt.getTime();
  }
  return {
    firstResponseDueAt,
    resolutionDueAt,
    firstResponseBreached,
    resolutionBreached,
  };
}

/* ---------------------------------------------------------------------- */

export class ClientPortalTicketController {
  /**
   * GET /api/client-portal/tickets?status=&category=&priority=&search=&page=&limit=
   */
  static async list(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const status = ((req.query.status as string) || "").toLowerCase();
    const category = ((req.query.category as string) || "").toLowerCase();
    const priority = ((req.query.priority as string) || "").toLowerCase();
    const search = ((req.query.search as string) || "").trim();
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
    );
    const offset = (page - 1) * limit;

    const params: any[] = [ctx.tenantId, ctx.clientId];
    let where = `WHERE t.tenant_id = $1 AND t.client_id = $2`;

    if (status && status !== "all") {
      params.push(status);
      where += ` AND t.status = $${params.length}`;
    }
    if (category && category !== "all") {
      params.push(category);
      where += ` AND t.category = $${params.length}`;
    }
    if (priority && priority !== "all") {
      params.push(priority);
      where += ` AND t.priority = $${params.length}`;
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
              t.status, t.project_id, t.due_date, t.first_response_at,
              t.resolved_at, t.closed_at,
              t.sla_response_target_minutes, t.sla_resolution_target_minutes,
              t.last_activity_at, t.created_at, t.updated_at,
              p.name AS project_name,
              (SELECT COUNT(*)::int FROM portal_ticket_messages m
                WHERE m.ticket_id = t.id) AS message_count
         FROM portal_tickets t
         LEFT JOIN projects p ON p.id = t.project_id
         ${where}
         ORDER BY t.last_activity_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    // Status counts for filter pills
    const counts = await pool.query(
      `SELECT status, COUNT(*)::int AS n
         FROM portal_tickets
        WHERE tenant_id = $1 AND client_id = $2
        GROUP BY status`,
      [ctx.tenantId, ctx.clientId],
    );
    const countMap: Record<string, number> = {};
    for (const row of counts.rows) countMap[row.status] = row.n;

    res.json({
      success: true,
      data: list.rows.map((row) => {
        const sla = decorateSla(row);
        return {
          id: row.id,
          ticketNumber: row.ticket_number,
          subject: row.subject,
          category: row.category,
          priority: row.priority,
          status: row.status,
          projectId: row.project_id,
          projectName: row.project_name,
          dueDate: row.due_date,
          firstResponseAt: row.first_response_at,
          resolvedAt: row.resolved_at,
          closedAt: row.closed_at,
          lastActivityAt: row.last_activity_at,
          messageCount: row.message_count || 0,
          createdAt: row.created_at,
          sla,
        };
      }),
      meta: {
        total,
        page,
        limit,
        counts: countMap,
      },
    });
  }

  /**
   * POST /api/client-portal/tickets
   * body: { subject, category, priority, projectId?, body, attachments?: [{dataUrl, fileName}] }
   */
  static async create(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const {
      subject,
      category,
      priority,
      projectId,
      body,
      attachments,
    } = req.body || {};

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

    // If projectId provided, verify it's actually linked to this client
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

    const sla = SLA_DEFAULTS[pri] || SLA_DEFAULTS.medium;
    const ticketNumber = await allocateTicketNumber(ctx.tenantId);

    const insertRes = await pool.query(
      `INSERT INTO portal_tickets
         (tenant_id, client_id, ticket_number, subject, category, priority,
          status, project_id, created_by_portal_user_id,
          sla_response_target_minutes, sla_resolution_target_minutes,
          last_activity_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'new', $7, $8, $9, $10, NOW())
       RETURNING id, ticket_number, subject, category, priority, status,
                 created_at`,
      [
        ctx.tenantId,
        ctx.clientId,
        ticketNumber,
        subject.trim(),
        cat,
        pri,
        projectId || null,
        ctx.portalUserId,
        sla.response,
        sla.resolution,
      ],
    );
    const ticket = insertRes.rows[0];

    // Upload attachments + insert first message
    let uploaded: Attachment[] = [];
    if (Array.isArray(attachments) && attachments.length > 0) {
      try {
        uploaded = await uploadAttachments(ctx.tenantId, ticket.id, attachments);
      } catch (err: any) {
        // Ticket already created; surface upload failure but keep the ticket.
        await pool.query(
          `INSERT INTO portal_ticket_messages
             (tenant_id, ticket_id, author_type, body, is_system_event,
              event_type, event_to)
           VALUES ($1, $2, 'system', $3, TRUE, 'attachment_upload_failed', $4)`,
          [ctx.tenantId, ticket.id, err?.message || "Upload error", null],
        );
      }
    }

    await pool.query(
      `INSERT INTO portal_ticket_messages
         (tenant_id, ticket_id, author_type, portal_user_id,
          body, attachments)
       VALUES ($1, $2, 'portal', $3, $4, $5::jsonb)`,
      [
        ctx.tenantId,
        ticket.id,
        ctx.portalUserId,
        body.trim(),
        JSON.stringify(uploaded),
      ],
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

  /**
   * GET /api/client-portal/tickets/:id
   */
  static async detail(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    const { id } = req.params;

    const ticketRes = await pool.query(
      `SELECT t.id, t.ticket_number, t.subject, t.category, t.priority,
              t.status, t.project_id, t.due_date,
              t.first_response_at, t.resolved_at, t.closed_at,
              t.sla_response_target_minutes, t.sla_resolution_target_minutes,
              t.last_activity_at, t.created_at, t.updated_at,
              t.assigned_staff_user_id,
              p.name AS project_name,
              u.name AS assigned_staff_name
         FROM portal_tickets t
         LEFT JOIN projects p ON p.id = t.project_id
         LEFT JOIN users u ON u.id = t.assigned_staff_user_id
        WHERE t.id = $1 AND t.tenant_id = $2 AND t.client_id = $3`,
      [id, ctx.tenantId, ctx.clientId],
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
      [id, ctx.tenantId],
    );

    res.json({
      success: true,
      data: {
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        projectId: ticket.project_id,
        projectName: ticket.project_name,
        assignedStaffUserId: ticket.assigned_staff_user_id,
        assignedStaffName: ticket.assigned_staff_name,
        dueDate: ticket.due_date,
        firstResponseAt: ticket.first_response_at,
        resolvedAt: ticket.resolved_at,
        closedAt: ticket.closed_at,
        lastActivityAt: ticket.last_activity_at,
        createdAt: ticket.created_at,
        sla: decorateSla(ticket),
        messages: messagesRes.rows.map((row) => ({
          id: row.id,
          authorType: row.author_type,
          portalUserId: row.portal_user_id,
          staffUserId: row.staff_user_id,
          portalUserName: row.portal_user_name,
          portalUserEmail: row.portal_user_email,
          staffUserName: row.staff_user_name,
          body: row.body,
          attachments: row.attachments || [],
          isSystemEvent: row.is_system_event,
          eventType: row.event_type,
          eventFrom: row.event_from,
          eventTo: row.event_to,
          createdAt: row.created_at,
        })),
      },
    });
  }

  /**
   * POST /api/client-portal/tickets/:id/messages
   * body: { body, attachments?: [{dataUrl, fileName}] }
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

    const ownerCheck = await pool.query(
      `SELECT status FROM portal_tickets
        WHERE id = $1 AND tenant_id = $2 AND client_id = $3`,
      [id, ctx.tenantId, ctx.clientId],
    );
    if (ownerCheck.rowCount === 0) {
      res.status(404).json({ success: false, error: "Ticket not found" });
      return;
    }
    if (ownerCheck.rows[0].status === "closed") {
      res.status(409).json({
        success: false,
        error: "This ticket is closed. Please raise a new one.",
      });
      return;
    }

    let uploaded: Attachment[] = [];
    if (Array.isArray(attachments) && attachments.length > 0) {
      uploaded = await uploadAttachments(ctx.tenantId, id, attachments);
    }

    const insertRes = await pool.query(
      `INSERT INTO portal_ticket_messages
         (tenant_id, ticket_id, author_type, portal_user_id,
          body, attachments)
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

    // If the ticket was waiting on the client, flip it back to in_progress.
    const nextStatus =
      ownerCheck.rows[0].status === "waiting_on_client"
        ? "in_progress"
        : null;
    if (nextStatus) {
      await pool.query(
        `UPDATE portal_tickets
            SET status = $1, last_activity_at = NOW(), updated_at = NOW()
          WHERE id = $2`,
        [nextStatus, id],
      );
      await pool.query(
        `INSERT INTO portal_ticket_messages
           (tenant_id, ticket_id, author_type, body, is_system_event,
            event_type, event_from, event_to)
         VALUES ($1, $2, 'system', NULL, TRUE, 'status_change', $3, $4)`,
        [ctx.tenantId, id, "waiting_on_client", nextStatus],
      );
    } else {
      await pool.query(
        `UPDATE portal_tickets
            SET last_activity_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [id],
      );
    }

    res.status(201).json({
      success: true,
      data: {
        id: insertRes.rows[0].id,
        createdAt: insertRes.rows[0].created_at,
        attachments: uploaded,
      },
    });
  }

  /**
   * Static: list the projects a portal user can pick when raising a ticket.
   * GET /api/client-portal/tickets/options/projects
   */
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

export default ClientPortalTicketController;
