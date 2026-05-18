import pool from "@/config/dbpool";
import { nanoid } from "nanoid";
import { s3Client, BUCKET_NAME } from "@/utils/r2Client";
import { PutObjectCommand } from "@aws-sdk/client-s3";

export const VALID_SUBJECT_TYPES = new Set([
  "design",
  "requirement",
  "sprint",
  "uat",
  "production_release",
  "cr",
  "invoice",
  "document",
  "custom",
]);

export interface ApprovalAttachment {
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
}

export async function allocateApprovalNumber(tenantId: string): Promise<string> {
  const r = await pool.query(
    `INSERT INTO portal_approval_counters (tenant_id, last_seq)
     VALUES ($1, 1)
     ON CONFLICT (tenant_id) DO UPDATE
       SET last_seq = portal_approval_counters.last_seq + 1
     RETURNING last_seq`,
    [tenantId],
  );
  return `AP-${String(r.rows[0].last_seq).padStart(6, "0")}`;
}

export async function uploadApprovalAttachments(
  tenantId: string,
  approvalId: string,
  files: { dataUrl: string; fileName: string }[],
): Promise<ApprovalAttachment[]> {
  const out: ApprovalAttachment[] = [];
  for (const f of files) {
    const m = f.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) continue;
    const contentType = m[1];
    const buffer = Buffer.from(m[2], "base64");
    if (buffer.length > 10 * 1024 * 1024) {
      throw new Error(`Attachment ${f.fileName} exceeds 10 MB`);
    }
    const safeName =
      (f.fileName || `file_${Date.now()}`).replace(/[^a-zA-Z0-9.-]/g, "_") ||
      "file";
    const uniqueId = nanoid(12);
    const key = `${tenantId}/client-portal/approvals/${approvalId}/${uniqueId}_${safeName}`;
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

/**
 * Compute and persist the rollup status for an approval.
 *
 * Rules: if cancelled, leave alone. Otherwise:
 *   - if any REQUIRED approver rejected → 'rejected'
 *   - else if all REQUIRED approvers approved → 'approved'
 *   - else if expires_at < now and still has pending decisions → 'expired'
 *   - else → 'open'
 *
 * Returns the resulting status. Caller should use this whenever an approver
 * decides or is added/removed.
 */
export async function recomputeApprovalStatus(
  tenantId: string,
  approvalId: string,
): Promise<string> {
  const head = await pool.query(
    `SELECT status, expires_at FROM portal_approval_requests
      WHERE id = $1 AND tenant_id = $2`,
    [approvalId, tenantId],
  );
  if (head.rowCount === 0) return "open";
  const current = head.rows[0].status as string;
  if (current === "cancelled") return current;

  const apr = await pool.query(
    `SELECT required, decision FROM portal_approval_approvers
      WHERE approval_id = $1 AND tenant_id = $2`,
    [approvalId, tenantId],
  );
  const required = apr.rows.filter((r) => r.required);
  let next = "open";
  if (required.length === 0) {
    next = "open";
  } else if (required.some((r) => r.decision === "rejected")) {
    next = "rejected";
  } else if (required.every((r) => r.decision === "approved")) {
    next = "approved";
  } else if (
    head.rows[0].expires_at &&
    new Date(head.rows[0].expires_at) < new Date()
  ) {
    next = "expired";
  } else {
    next = "open";
  }

  if (next !== current) {
    await pool.query(
      `UPDATE portal_approval_requests
          SET status = $1, last_activity_at = NOW(), updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3`,
      [next, approvalId, tenantId],
    );
  }
  return next;
}

export async function logApprovalEvent(
  tenantId: string,
  approvalId: string,
  eventType: string,
  opts: {
    actorType?: "staff" | "portal" | "system";
    actorStaffUserId?: string | null;
    actorPortalId?: string | null;
    payload?: any;
  } = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO portal_approval_events
       (tenant_id, approval_id, event_type, actor_type,
        actor_staff_user_id, actor_portal_id, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      tenantId,
      approvalId,
      eventType,
      opts.actorType || null,
      opts.actorStaffUserId || null,
      opts.actorPortalId || null,
      opts.payload ? JSON.stringify(opts.payload) : null,
    ],
  );
}

export async function loadApprovalDetail(
  tenantId: string,
  approvalId: string,
  visibility: "staff" | "portal",
  scopeClientId?: string,
): Promise<any | null> {
  const headParams: any[] = [approvalId, tenantId];
  let where = `WHERE a.id = $1 AND a.tenant_id = $2`;
  if (scopeClientId) {
    headParams.push(scopeClientId);
    where += ` AND a.client_id = $${headParams.length}`;
  }
  const head = await pool.query(
    `SELECT a.*, c.company_name AS client_name,
            p.name AS project_name, p.code AS project_code,
            u.name AS requested_by_name
       FROM portal_approval_requests a
       LEFT JOIN clients_v2 c ON c.id = a.client_id
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN users u ON u.id = a.requested_by_staff_user_id
       ${where}`,
    headParams,
  );
  if (head.rowCount === 0) return null;
  const a = head.rows[0];

  const [appr, attach, events] = await Promise.all([
    pool.query(
      `SELECT ap.id, ap.approver_type, ap.portal_user_id, ap.staff_user_id,
              ap.required, ap.decision, ap.decision_note, ap.decided_at,
              ap.position,
              pu.display_name AS portal_user_name, pu.email AS portal_user_email,
              su.name AS staff_user_name
         FROM portal_approval_approvers ap
         LEFT JOIN client_portal_users pu ON pu.id = ap.portal_user_id
         LEFT JOIN users su ON su.id = ap.staff_user_id
        WHERE ap.approval_id = $1 AND ap.tenant_id = $2
        ORDER BY ap.position ASC, ap.created_at ASC`,
      [approvalId, tenantId],
    ),
    pool.query(
      `SELECT id, file_name, file_url, file_size_bytes, mime_type,
              uploaded_by_type, created_at
         FROM portal_approval_attachments
        WHERE approval_id = $1 AND tenant_id = $2
        ORDER BY created_at ASC`,
      [approvalId, tenantId],
    ),
    pool.query(
      `SELECT e.id, e.event_type, e.actor_type, e.actor_staff_user_id,
              e.actor_portal_id, e.payload, e.created_at,
              su.name AS actor_staff_name,
              pu.display_name AS actor_portal_name
         FROM portal_approval_events e
         LEFT JOIN users su ON su.id = e.actor_staff_user_id
         LEFT JOIN client_portal_users pu ON pu.id = e.actor_portal_id
        WHERE e.approval_id = $1 AND e.tenant_id = $2
        ORDER BY e.created_at ASC`,
      [approvalId, tenantId],
    ),
  ]);

  const out = {
    id: a.id,
    approvalNumber: a.approval_number,
    title: a.title,
    description: a.description,
    previewUrl: a.preview_url,
    subjectType: a.subject_type,
    subjectId: a.subject_id,
    subjectLabel: a.subject_label,
    status: a.status,
    dueDate: a.due_date,
    expiresAt: a.expires_at,
    lastActivityAt: a.last_activity_at,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
    clientId: a.client_id,
    clientName: a.client_name,
    projectId: a.project_id,
    projectName: a.project_name,
    projectCode: a.project_code,
    requestedByName: a.requested_by_name,
    approvers: appr.rows.map((r) => ({
      id: r.id,
      approverType: r.approver_type,
      portalUserId: r.portal_user_id,
      staffUserId: r.staff_user_id,
      portalUserName: r.portal_user_name,
      portalUserEmail: r.portal_user_email,
      staffUserName: r.staff_user_name,
      required: r.required,
      decision: r.decision,
      decisionNote: r.decision_note,
      decidedAt: r.decided_at,
      position: r.position,
    })),
    attachments: attach.rows,
    events: events.rows.map((e) => ({
      id: e.id,
      eventType: e.event_type,
      actorType: e.actor_type,
      actorStaffName: e.actor_staff_name,
      actorPortalName: e.actor_portal_name,
      payload: e.payload,
      createdAt: e.created_at,
    })),
  };

  // Portal sees a slightly redacted view (no internal staff approvers'
  // identifying info, no events from staff-only actors). For now we expose
  // everything but keep this seam so we can tighten later.
  if (visibility === "portal") {
    return out;
  }
  return out;
}
