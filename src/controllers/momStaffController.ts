import { Response } from "express";
import { nanoid } from "nanoid";
import pool from "@/config/dbpool";
import { AuthRequest } from "@/types";
import { allocateCrNumber } from "./clientPortalCrController";
import { s3Client, BUCKET_NAME } from "@/utils/r2Client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { socketService } from "@/services/socketService";

/**
 * Staff-side CRUD for Minutes of Meeting. MOMs are nested objects with
 * attendees, decisions and action items inlined — we build the create/update
 * endpoints to accept the full payload in one round-trip so the FE doesn't
 * juggle dependent calls.
 *
 * Read scope: any staff user with the standard tenant context. We could add
 * a per-permission gate later, but for now this is open to authenticated
 * tenant users (matching the way `clientV2Controller` exposes contacts).
 */

interface AttendeePayload {
  id?: string;
  name: string;
  email?: string | null;
  role?: string | null;
  party?: "client" | "internal" | "external";
  staffUserId?: string | null;
  portalUserId?: string | null;
}
interface DecisionPayload {
  id?: string;
  decision: string;
  decidedBy?: string | null;
}
interface ActionItemPayload {
  id?: string;
  text: string;
  ownerName?: string | null;
  ownerStaffUserId?: string | null;
  ownerPortalUserId?: string | null;
  dueDate?: string | null; // ISO date
  status?: "open" | "in_progress" | "done" | "cancelled";
}

/**
 * Attachments come in two shapes:
 *  - `file`: a newly uploaded file (base64 data URL → R2)
 *  - `link`: an external URL (e.g. DocumentHub doc, Figma, Loom)
 *
 * Existing rows being preserved across an update should pass `id` only — the
 * controller leaves those alone.
 */
interface AttachmentPayload {
  id?: string;
  kind: "file" | "link";
  // For kind='file' on initial upload
  fileDataUrl?: string;
  fileName?: string;
  // For kind='link'
  linkUrl?: string;
  linkLabel?: string | null;
}

async function uploadMomFile(
  tenantId: string,
  momId: string,
  dataUrl: string,
  fileName: string,
): Promise<{ fileName: string; fileUrl: string; fileSize: number; mimeType: string }> {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("Invalid file format. Expected base64 data URL.");
  const contentType = m[1];
  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length > 25 * 1024 * 1024) {
    throw new Error(`Attachment ${fileName} exceeds 25 MB`);
  }
  const safeName =
    (fileName || `file_${Date.now()}`).replace(/[^a-zA-Z0-9.-]/g, "_") ||
    "file";
  const uniqueId = nanoid(12);
  const key = `${tenantId}/client-portal/mom-attachments/${momId}/${uniqueId}_${safeName}`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // Inline so the portal drawer iframe can render PDFs/images directly.
      ContentDisposition: `inline; filename="${safeName}"`,
      CacheControl: "private, max-age=0, no-store",
    }),
  );
  const publicBase =
    process.env.CF_R2_PUBLIC_URL &&
    !process.env.CF_R2_PUBLIC_URL.includes("r2.cloudflarestorage.com")
      ? process.env.CF_R2_PUBLIC_URL.replace(/\/$/, "")
      : "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
  return {
    fileName: safeName,
    fileUrl: `${publicBase}/${key}`,
    fileSize: buffer.length,
    mimeType: contentType,
  };
}

async function insertMomAttachments(
  tenantId: string,
  momId: string,
  userId: string | null,
  attachments: AttachmentPayload[],
): Promise<void> {
  for (let i = 0; i < attachments.length; i++) {
    const a = attachments[i];
    if (a.kind === "file") {
      if (!a.fileDataUrl || !a.fileName) continue;
      const uploaded = await uploadMomFile(
        tenantId,
        momId,
        a.fileDataUrl,
        a.fileName,
      );
      await pool.query(
        `INSERT INTO portal_mom_attachments
           (tenant_id, mom_id, kind, file_name, file_url, file_size_bytes,
            mime_type, position, created_by_user_id)
         VALUES ($1, $2, 'file', $3, $4, $5, $6, $7, $8)`,
        [
          tenantId,
          momId,
          uploaded.fileName,
          uploaded.fileUrl,
          uploaded.fileSize,
          uploaded.mimeType,
          i,
          userId,
        ],
      );
    } else if (a.kind === "link") {
      if (!a.linkUrl) continue;
      await pool.query(
        `INSERT INTO portal_mom_attachments
           (tenant_id, mom_id, kind, link_url, link_label, position,
            created_by_user_id)
         VALUES ($1, $2, 'link', $3, $4, $5, $6)`,
        [
          tenantId,
          momId,
          a.linkUrl.trim(),
          (a.linkLabel || "").trim() || null,
          i,
          userId,
        ],
      );
    }
  }
}

async function allocateMomNumber(tenantId: string): Promise<string> {
  const r = await pool.query(
    `INSERT INTO portal_mom_counters (tenant_id, last_seq)
     VALUES ($1, 1)
     ON CONFLICT (tenant_id) DO UPDATE
       SET last_seq = portal_mom_counters.last_seq + 1
     RETURNING last_seq`,
    [tenantId],
  );
  return `MOM-${String(r.rows[0].last_seq).padStart(5, "0")}`;
}

async function loadMomFull(tenantId: string, id: string) {
  const m = await pool.query(
    `SELECT m.*, c.company_name AS client_name, p.name AS project_name,
            u.name AS created_by_name
       FROM portal_moms m
       LEFT JOIN clients_v2 c ON c.id = m.client_id
       LEFT JOIN projects p ON p.id = m.project_id
       LEFT JOIN users u ON u.id = m.created_by_user_id
      WHERE m.id = $1 AND m.tenant_id = $2`,
    [id, tenantId],
  );
  if (m.rowCount === 0) return null;
  const [attendees, decisions, actionItems, attachments] = await Promise.all([
    pool.query(
      `SELECT id, name, email, role, party, staff_user_id, portal_user_id, position
         FROM portal_mom_attendees
        WHERE mom_id = $1 AND tenant_id = $2
        ORDER BY position ASC, name ASC`,
      [id, tenantId],
    ),
    pool.query(
      `SELECT id, decision, decided_by, position, created_at
         FROM portal_mom_decisions
        WHERE mom_id = $1 AND tenant_id = $2
        ORDER BY position ASC, created_at ASC`,
      [id, tenantId],
    ),
    pool.query(
      `SELECT ai.*, pt.ticket_number AS converted_ticket_number,
              pt.subject AS converted_ticket_subject,
              pt.status  AS converted_ticket_status
         FROM portal_mom_action_items ai
         LEFT JOIN portal_tickets pt
                ON ai.converted_to_type = 'portal_ticket'
               AND pt.id = ai.converted_to_id
        WHERE ai.mom_id = $1 AND ai.tenant_id = $2
        ORDER BY ai.position ASC, ai.created_at ASC`,
      [id, tenantId],
    ),
    pool.query(
      `SELECT id, kind, file_name, file_url, file_size_bytes, mime_type,
              link_url, link_label, position, created_at
         FROM portal_mom_attachments
        WHERE mom_id = $1 AND tenant_id = $2
        ORDER BY position ASC, created_at ASC`,
      [id, tenantId],
    ),
  ]);
  return {
    mom: m.rows[0],
    attendees: attendees.rows,
    decisions: decisions.rows,
    actionItems: actionItems.rows,
    attachments: attachments.rows,
  };
}

function shape(full: NonNullable<Awaited<ReturnType<typeof loadMomFull>>>) {
  const { mom, attendees, decisions, actionItems, attachments } = full;
  return {
    id: mom.id,
    momNumber: mom.mom_number,
    title: mom.title,
    clientId: mom.client_id,
    clientName: mom.client_name,
    projectId: mom.project_id,
    projectName: mom.project_name,
    meetingDate: mom.meeting_date,
    durationMinutes: mom.duration_minutes,
    location: mom.location,
    recordingUrl: mom.recording_url,
    summary: mom.summary,
    aiSummary: mom.ai_summary,
    visibility: mom.visibility,
    status: mom.status,
    createdAt: mom.created_at,
    updatedAt: mom.updated_at,
    createdByName: mom.created_by_name,
    attendees: attendees.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      role: a.role,
      party: a.party,
      staffUserId: a.staff_user_id,
      portalUserId: a.portal_user_id,
      position: a.position,
    })),
    decisions: decisions.map((d) => ({
      id: d.id,
      decision: d.decision,
      decidedBy: d.decided_by,
      position: d.position,
      createdAt: d.created_at,
    })),
    actionItems: actionItems.map((ai) => ({
      id: ai.id,
      text: ai.text,
      ownerName: ai.owner_name,
      ownerStaffUserId: ai.owner_staff_user_id,
      ownerPortalUserId: ai.owner_portal_user_id,
      dueDate: ai.due_date,
      status: ai.status,
      position: ai.position,
      convertedToType: ai.converted_to_type,
      convertedToId: ai.converted_to_id,
      convertedAt: ai.converted_at,
      convertedTicketNumber: ai.converted_ticket_number,
      convertedTicketSubject: ai.converted_ticket_subject,
      convertedTicketStatus: ai.converted_ticket_status,
      createdAt: ai.created_at,
      updatedAt: ai.updated_at,
    })),
    attachments: attachments.map((a) => ({
      id: a.id,
      kind: a.kind,
      fileName: a.file_name,
      fileUrl: a.file_url,
      fileSizeBytes: a.file_size_bytes,
      mimeType: a.mime_type,
      linkUrl: a.link_url,
      linkLabel: a.link_label,
      position: a.position,
      createdAt: a.created_at,
    })),
  };
}

export class MomStaffController {
  /** GET /api/clients-v2/:clientId/moms */
  static async listForClient(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { clientId } = req.params;
    const r = await pool.query(
      `SELECT m.id, m.mom_number, m.title, m.meeting_date, m.duration_minutes,
              m.status, m.visibility, m.project_id, p.name AS project_name,
              m.recording_url, m.created_at,
              (SELECT COUNT(*)::int FROM portal_mom_action_items ai
                WHERE ai.mom_id = m.id) AS action_count,
              (SELECT COUNT(*)::int FROM portal_mom_action_items ai
                WHERE ai.mom_id = m.id AND ai.status IN ('open','in_progress'))
                AS open_action_count,
              (SELECT COUNT(*)::int FROM portal_mom_attendees a
                WHERE a.mom_id = m.id) AS attendee_count,
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
        WHERE m.tenant_id = $1 AND m.client_id = $2
        ORDER BY m.meeting_date DESC`,
      [tenantId, clientId],
    );
    res.json({
      success: true,
      data: r.rows.map((row) => ({
        id: row.id,
        momNumber: row.mom_number,
        title: row.title,
        meetingDate: row.meeting_date,
        durationMinutes: row.duration_minutes,
        status: row.status,
        visibility: row.visibility,
        projectId: row.project_id,
        projectName: row.project_name,
        recordingUrl: row.recording_url,
        createdAt: row.created_at,
        actionCount: row.action_count || 0,
        openActionCount: row.open_action_count || 0,
        attendeeCount: row.attendee_count || 0,
        attachments: row.attachments || [],
      })),
    });
  }

  /** GET /api/moms/:id */
  static async detail(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const full = await loadMomFull(tenantId, req.params.id);
    if (!full) {
      res.status(404).json({ success: false, error: "MOM not found" });
      return;
    }
    res.json({ success: true, data: shape(full) });
  }

  /**
   * POST /api/clients-v2/:clientId/moms
   * body: { title, meetingDate, projectId?, durationMinutes?, location?,
   *         recordingUrl?, summary?, aiSummary?, visibility?, status?,
   *         attendees?: AttendeePayload[],
   *         decisions?: DecisionPayload[],
   *         actionItems?: ActionItemPayload[] }
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user?.id || null;
    const { clientId } = req.params;
    const b = req.body || {};

    if (!b.title || !b.meetingDate) {
      res.status(400).json({
        success: false,
        error: "title and meetingDate are required",
      });
      return;
    }

    // Verify client belongs to tenant
    const cl = await pool.query(
      `SELECT 1 FROM clients_v2 WHERE id = $1 AND tenant_id = $2`,
      [clientId, tenantId],
    );
    if (cl.rowCount === 0) {
      res.status(404).json({ success: false, error: "Client not found" });
      return;
    }

    // If projectId, verify linkage
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

    const momNumber = await allocateMomNumber(tenantId);
    const visibility = b.visibility || "client";
    const status = b.status || "published";

    const ins = await pool.query(
      `INSERT INTO portal_moms
         (tenant_id, client_id, project_id, mom_number, title, meeting_date,
          duration_minutes, location, recording_url, summary, ai_summary,
          visibility, status, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        tenantId,
        clientId,
        b.projectId || null,
        momNumber,
        String(b.title).trim(),
        b.meetingDate,
        b.durationMinutes || null,
        b.location || null,
        b.recordingUrl || null,
        b.summary || null,
        b.aiSummary || null,
        visibility,
        status,
        userId,
      ],
    );
    const id = ins.rows[0].id as string;

    await insertChildren(tenantId, id, {
      attendees: b.attendees,
      decisions: b.decisions,
      actionItems: b.actionItems,
    });

    if (Array.isArray(b.attachments) && b.attachments.length > 0) {
      await insertMomAttachments(tenantId, id, userId, b.attachments);
    }

    const full = await loadMomFull(tenantId, id);
    socketService.emitToClient(tenantId, clientId, "mom:created", {
      clientId,
      id,
    });
    res.status(201).json({ success: true, data: full ? shape(full) : { id } });
  }

  /**
   * PUT /api/moms/:id
   * Replaces children when arrays are provided. Pass `undefined` to leave
   * a collection untouched.
   */
  static async update(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user?.id || null;
    const { id } = req.params;
    const b = req.body || {};

    const cur = await pool.query(
      `SELECT id, client_id FROM portal_moms WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (cur.rowCount === 0) {
      res.status(404).json({ success: false, error: "MOM not found" });
      return;
    }

    const fields: string[] = [];
    const params: any[] = [];
    const push = (col: string, val: any) => {
      params.push(val);
      fields.push(`${col} = $${params.length}`);
    };
    if (b.title !== undefined) push("title", String(b.title).trim());
    if (b.meetingDate !== undefined) push("meeting_date", b.meetingDate);
    if (b.projectId !== undefined) push("project_id", b.projectId || null);
    if (b.durationMinutes !== undefined)
      push("duration_minutes", b.durationMinutes || null);
    if (b.location !== undefined) push("location", b.location || null);
    if (b.recordingUrl !== undefined)
      push("recording_url", b.recordingUrl || null);
    if (b.summary !== undefined) push("summary", b.summary || null);
    if (b.aiSummary !== undefined) push("ai_summary", b.aiSummary || null);
    if (b.visibility !== undefined) push("visibility", b.visibility);
    if (b.status !== undefined) push("status", b.status);

    if (fields.length > 0) {
      params.push(id);
      params.push(tenantId);
      await pool.query(
        `UPDATE portal_moms SET ${fields.join(", ")}, updated_at = NOW()
          WHERE id = $${params.length - 1} AND tenant_id = $${params.length}`,
        params,
      );
    }

    // Replace child collections only when explicitly provided
    if (Array.isArray(b.attendees)) {
      await pool.query(
        `DELETE FROM portal_mom_attendees WHERE mom_id = $1 AND tenant_id = $2`,
        [id, tenantId],
      );
    }
    if (Array.isArray(b.decisions)) {
      await pool.query(
        `DELETE FROM portal_mom_decisions WHERE mom_id = $1 AND tenant_id = $2`,
        [id, tenantId],
      );
    }
    if (Array.isArray(b.actionItems)) {
      // Preserve any action items that have been converted into a portal
      // ticket or change request — they carry references we don't want to
      // lose. We only re-replace the unconverted ones.
      await pool.query(
        `DELETE FROM portal_mom_action_items
          WHERE mom_id = $1 AND tenant_id = $2
            AND converted_to_id IS NULL`,
        [id, tenantId],
      );
    }
    await insertChildren(tenantId, id, {
      attendees: Array.isArray(b.attendees) ? b.attendees : undefined,
      decisions: Array.isArray(b.decisions) ? b.decisions : undefined,
      actionItems: Array.isArray(b.actionItems) ? b.actionItems : undefined,
    });

    // Attachments: diff existing rows against the new array. Items with `id`
    // are preserved; items WITHOUT `id` are treated as new (uploaded or
    // linked). Existing rows whose id isn't in the new array get deleted.
    if (Array.isArray(b.attachments)) {
      const keepIds = b.attachments
        .map((a: any) => a?.id)
        .filter(Boolean) as string[];
      if (keepIds.length === 0) {
        await pool.query(
          `DELETE FROM portal_mom_attachments
            WHERE mom_id = $1 AND tenant_id = $2`,
          [id, tenantId],
        );
      } else {
        await pool.query(
          `DELETE FROM portal_mom_attachments
            WHERE mom_id = $1 AND tenant_id = $2
              AND NOT (id = ANY($3::text[]))`,
          [id, tenantId, keepIds],
        );
      }
      const fresh = (b.attachments as AttachmentPayload[]).filter(
        (a) => !a.id,
      );
      if (fresh.length > 0) {
        await insertMomAttachments(tenantId, id, userId, fresh);
      }
    }

    const full = await loadMomFull(tenantId, id);
    const clientIdForEmit = (cur.rows[0] as any).client_id as string;
    socketService.emitToClient(tenantId, clientIdForEmit, "mom:updated", {
      clientId: clientIdForEmit,
      id,
    });
    res.json({ success: true, data: full ? shape(full) : null });
  }

  /** DELETE /api/moms/:id */
  static async remove(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const before = await pool.query(
      `SELECT client_id FROM portal_moms WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (before.rowCount === 0) {
      res.status(404).json({ success: false, error: "MOM not found" });
      return;
    }
    const clientIdForEmit = (before.rows[0] as any).client_id as string;
    await pool.query(
      `DELETE FROM portal_moms WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    socketService.emitToClient(tenantId, clientIdForEmit, "mom:deleted", {
      clientId: clientIdForEmit,
      id,
    });
    res.json({ success: true });
  }

  /**
   * PATCH /api/moms/action-items/:itemId/status
   * body: { status }
   */
  static async updateActionItemStatus(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    const tenantId = req.tenantId!;
    const { itemId } = req.params;
    const { status } = req.body || {};
    const allowed = new Set([
      "open",
      "in_progress",
      "done",
      "cancelled",
    ]);
    if (!allowed.has(status)) {
      res.status(400).json({ success: false, error: "Invalid status" });
      return;
    }
    const r = await pool.query(
      `UPDATE portal_mom_action_items
          SET status = $1, updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3
        RETURNING id, status`,
      [status, itemId, tenantId],
    );
    if (r.rowCount === 0) {
      res.status(404).json({ success: false, error: "Action item not found" });
      return;
    }
    res.json({ success: true, data: r.rows[0] });
  }

  /**
   * POST /api/moms/action-items/:itemId/convert
   * body: { target: 'portal_ticket' | 'change_request',
   *         category?, priority? }
   *
   * Dispatches to the appropriate target module (a portal support ticket or
   * a change request), seeds its conversation thread with a "created from
   * MOM" event, and marks the source action item as converted with a link
   * back to the new row.
   *
   * Future target: 'ticket' (staff engineering ticket) — needs a project
   * picker, so deferred.
   */
  static async convertActionItem(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user?.id || null;
    const { itemId } = req.params;
    const { target, category, priority } = req.body || {};

    if (target !== "portal_ticket" && target !== "change_request") {
      res.status(400).json({
        success: false,
        error:
          "target must be 'portal_ticket' or 'change_request' in this release.",
      });
      return;
    }

    // Load the action item + its parent MOM so we have client/project context
    const aiRow = await pool.query(
      `SELECT ai.*, m.client_id, m.project_id, m.mom_number, m.title AS mom_title
         FROM portal_mom_action_items ai
         JOIN portal_moms m ON m.id = ai.mom_id
        WHERE ai.id = $1 AND ai.tenant_id = $2`,
      [itemId, tenantId],
    );
    if (aiRow.rowCount === 0) {
      res.status(404).json({ success: false, error: "Action item not found" });
      return;
    }
    const ai = aiRow.rows[0];
    if (ai.converted_to_id) {
      res.status(409).json({
        success: false,
        error: "Action item already converted",
      });
      return;
    }

    if (target === "change_request") {
      const result = await convertToChangeRequest({
        tenantId,
        userId,
        itemId,
        ai,
        priority,
      });
      res.status(201).json({ success: true, data: result });
      return;
    }

    const cat = (category || "support").toLowerCase();
    const pri = (priority || "medium").toLowerCase();

    // Allocate ticket number via the same per-tenant counter the portal uses
    const seq = await pool.query(
      `INSERT INTO portal_ticket_counters (tenant_id, last_seq)
       VALUES ($1, 1)
       ON CONFLICT (tenant_id) DO UPDATE
         SET last_seq = portal_ticket_counters.last_seq + 1
       RETURNING last_seq`,
      [tenantId],
    );
    const ticketNumber = `PT-${String(seq.rows[0].last_seq).padStart(6, "0")}`;

    // SLA defaults mirror clientPortalTicketController
    const slaMap: Record<string, [number, number]> = {
      critical: [60, 8 * 60],
      high: [4 * 60, 24 * 60],
      medium: [8 * 60, 3 * 24 * 60],
      low: [24 * 60, 7 * 24 * 60],
    };
    const [slaResp, slaResol] = slaMap[pri] || slaMap.medium;

    const subject = ai.text.length > 200 ? ai.text.slice(0, 197) + "…" : ai.text;
    const ticketIns = await pool.query(
      `INSERT INTO portal_tickets
         (tenant_id, client_id, ticket_number, subject, category, priority,
          status, project_id, assigned_staff_user_id, due_date,
          sla_response_target_minutes, sla_resolution_target_minutes,
          last_activity_at)
       VALUES ($1,$2,$3,$4,$5,$6,'new',$7,$8,$9,$10,$11,NOW())
       RETURNING id`,
      [
        tenantId,
        ai.client_id,
        ticketNumber,
        subject,
        cat,
        pri,
        ai.project_id || null,
        userId,
        ai.due_date || null,
        slaResp,
        slaResol,
      ],
    );
    const ticketId = ticketIns.rows[0].id;

    // Seed the conversation with a system message + the action item text so
    // the thread reads naturally on both sides.
    await pool.query(
      `INSERT INTO portal_ticket_messages
         (tenant_id, ticket_id, author_type, body, is_system_event,
          event_type, event_to)
       VALUES ($1, $2, 'system', $3, TRUE, 'created_from_mom', $4)`,
      [
        tenantId,
        ticketId,
        `Created from action item in ${ai.mom_number} · "${ai.mom_title}"`,
        ai.mom_id,
      ],
    );
    await pool.query(
      `INSERT INTO portal_ticket_messages
         (tenant_id, ticket_id, author_type, staff_user_id, body)
       VALUES ($1, $2, 'staff', $3, $4)`,
      [tenantId, ticketId, userId, ai.text],
    );

    // Mark the action item as converted
    await pool.query(
      `UPDATE portal_mom_action_items
          SET status = 'converted',
              converted_to_type = 'portal_ticket',
              converted_to_id = $1,
              converted_at = NOW(),
              converted_by_user_id = $2,
              updated_at = NOW()
        WHERE id = $3 AND tenant_id = $4`,
      [ticketId, userId, itemId, tenantId],
    );

    res.status(201).json({
      success: true,
      data: {
        actionItemId: itemId,
        ticketId,
        ticketNumber,
        target: "portal_ticket",
      },
    });
  }
}

async function insertChildren(
  tenantId: string,
  momId: string,
  payload: {
    attendees?: AttendeePayload[];
    decisions?: DecisionPayload[];
    actionItems?: ActionItemPayload[];
  },
): Promise<void> {
  if (payload.attendees) {
    for (let i = 0; i < payload.attendees.length; i++) {
      const a = payload.attendees[i];
      if (!a?.name) continue;
      await pool.query(
        `INSERT INTO portal_mom_attendees
           (tenant_id, mom_id, name, email, role, party,
            staff_user_id, portal_user_id, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          tenantId,
          momId,
          a.name.trim(),
          a.email || null,
          a.role || null,
          a.party || "client",
          a.staffUserId || null,
          a.portalUserId || null,
          i,
        ],
      );
    }
  }
  if (payload.decisions) {
    for (let i = 0; i < payload.decisions.length; i++) {
      const d = payload.decisions[i];
      if (!d?.decision) continue;
      await pool.query(
        `INSERT INTO portal_mom_decisions
           (tenant_id, mom_id, decision, decided_by, position)
         VALUES ($1,$2,$3,$4,$5)`,
        [tenantId, momId, d.decision.trim(), d.decidedBy || null, i],
      );
    }
  }
  if (payload.actionItems) {
    for (let i = 0; i < payload.actionItems.length; i++) {
      const ai = payload.actionItems[i];
      if (!ai?.text) continue;
      await pool.query(
        `INSERT INTO portal_mom_action_items
           (tenant_id, mom_id, text, owner_name, owner_staff_user_id,
            owner_portal_user_id, due_date, status, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          tenantId,
          momId,
          ai.text.trim(),
          ai.ownerName || null,
          ai.ownerStaffUserId || null,
          ai.ownerPortalUserId || null,
          ai.dueDate || null,
          ai.status || "open",
          i,
        ],
      );
    }
  }
}

/**
 * Convert a MOM action item into a `portal_change_requests` row. Seeds the
 * CR's conversation thread with a system event + the action-item text as
 * a staff message, then marks the source action item as converted.
 */
async function convertToChangeRequest(opts: {
  tenantId: string;
  userId: string | null;
  itemId: string;
  ai: any;
  priority?: string;
}): Promise<{
  actionItemId: string;
  crId: string;
  crNumber: string;
  target: "change_request";
}> {
  const { tenantId, userId, itemId, ai } = opts;
  const pri = (opts.priority || "medium").toLowerCase();
  const subject =
    ai.text.length > 200 ? ai.text.slice(0, 197) + "…" : ai.text;
  const crNumber = await allocateCrNumber(tenantId);

  const crIns = await pool.query(
    `INSERT INTO portal_change_requests
       (tenant_id, client_id, project_id, cr_number, subject, description,
        priority, status, target_delivery_date,
        created_by_staff_user_id, assigned_staff_user_id,
        source_mom_action_item_id, last_activity_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'under_review',$8,$9,$10,$11,NOW())
     RETURNING id`,
    [
      tenantId,
      ai.client_id,
      ai.project_id || null,
      crNumber,
      subject,
      ai.text,
      pri,
      ai.due_date || null,
      userId,
      userId,
      itemId,
    ],
  );
  const crId = crIns.rows[0].id as string;

  await pool.query(
    `INSERT INTO portal_cr_messages
       (tenant_id, cr_id, author_type, body, is_system_event,
        event_type, event_to)
     VALUES ($1, $2, 'system', $3, TRUE, 'created_from_mom', $4)`,
    [
      tenantId,
      crId,
      `Created from action item in ${ai.mom_number} · "${ai.mom_title}"`,
      ai.mom_id,
    ],
  );
  await pool.query(
    `INSERT INTO portal_cr_messages
       (tenant_id, cr_id, author_type, staff_user_id, body)
     VALUES ($1, $2, 'staff', $3, $4)`,
    [tenantId, crId, userId, ai.text],
  );

  await pool.query(
    `UPDATE portal_mom_action_items
        SET status = 'converted',
            converted_to_type = 'change_request',
            converted_to_id = $1,
            converted_at = NOW(),
            converted_by_user_id = $2,
            updated_at = NOW()
      WHERE id = $3 AND tenant_id = $4`,
    [crId, userId, itemId, tenantId],
  );

  return {
    actionItemId: itemId,
    crId,
    crNumber,
    target: "change_request",
  };
}

export default MomStaffController;
