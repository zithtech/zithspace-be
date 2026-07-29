import { recordTransaction, Section, Module, Page, Action, EntityType } from "@/utils/transactionHistory";
import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest } from "@/types";
import {
  VALID_SUBJECT_TYPES,
  allocateApprovalNumber,
  uploadApprovalAttachments,
  recomputeApprovalStatus,
  logApprovalEvent,
  loadApprovalDetail,
} from "./approvalsShared";

interface ApproverPayload {
  approverType: "portal" | "staff";
  portalUserId?: string | null;
  staffUserId?: string | null;
  required?: boolean;
}

export class ApprovalsStaffController {
  /** GET /api/clients-v2/:clientId/approvals */
  static async listForClient(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { clientId } = req.params;
    const r = await pool.query(
      `SELECT a.id, a.approval_number, a.title, a.subject_type, a.subject_label,
              a.status, a.due_date, a.expires_at, a.last_activity_at,
              a.created_at, a.project_id, p.name AS project_name,
              u.name AS requested_by_name,
              (SELECT COUNT(*)::int FROM portal_approval_approvers ap
                WHERE ap.approval_id = a.id AND ap.required = TRUE) AS required_count,
              (SELECT COUNT(*)::int FROM portal_approval_approvers ap
                WHERE ap.approval_id = a.id AND ap.required = TRUE
                  AND ap.decision = 'approved') AS approved_count,
              (SELECT COUNT(*)::int FROM portal_approval_approvers ap
                WHERE ap.approval_id = a.id AND ap.required = TRUE
                  AND ap.decision = 'rejected') AS rejected_count
         FROM portal_approval_requests a
         LEFT JOIN projects p ON p.id = a.project_id
         LEFT JOIN users u ON u.id = a.requested_by_staff_user_id
        WHERE a.tenant_id = $1 AND a.client_id = $2
        ORDER BY a.last_activity_at DESC`,
      [tenantId, clientId],
    );
    res.json({
      success: true,
      data: r.rows.map((row) => ({
        id: row.id,
        approvalNumber: row.approval_number,
        title: row.title,
        subjectType: row.subject_type,
        subjectLabel: row.subject_label,
        status: row.status,
        dueDate: row.due_date,
        expiresAt: row.expires_at,
        lastActivityAt: row.last_activity_at,
        createdAt: row.created_at,
        projectId: row.project_id,
        projectName: row.project_name,
        requestedByName: row.requested_by_name,
        requiredCount: row.required_count || 0,
        approvedCount: row.approved_count || 0,
        rejectedCount: row.rejected_count || 0,
      })),
    });
  }

  /**
   * POST /api/clients-v2/:clientId/approvals
   * body: { title, subjectType, subjectLabel?, subjectId?, projectId?,
   *         description?, previewUrl?, dueDate?, expiresAt?,
   *         approvers: ApproverPayload[],
   *         attachments?: [{dataUrl, fileName}] }
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user?.id || null;
    const { clientId } = req.params;
    const b = req.body || {};

    if (!b.title?.trim() || !b.subjectType) {
      res.status(400).json({
        success: false,
        error: "title and subjectType are required",
      });
      return;
    }
    if (!VALID_SUBJECT_TYPES.has(String(b.subjectType))) {
      res.status(400).json({ success: false, error: "Invalid subjectType" });
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

    const approversIn: ApproverPayload[] = Array.isArray(b.approvers)
      ? b.approvers
      : [];
    // Verify portal users belong to this client, staff users belong to tenant
    for (const a of approversIn) {
      if (a.approverType === "portal" && a.portalUserId) {
        const ok = await pool.query(
          `SELECT 1 FROM client_portal_users
            WHERE id = $1 AND tenant_id = $2 AND client_id = $3`,
          [a.portalUserId, tenantId, clientId],
        );
        if (ok.rowCount === 0) {
          res.status(400).json({
            success: false,
            error: `Portal user ${a.portalUserId} is not on this client`,
          });
          return;
        }
      }
    }

    const approvalNumber = await allocateApprovalNumber(tenantId);
    const ins = await pool.query(
      `INSERT INTO portal_approval_requests
         (tenant_id, client_id, project_id, approval_number, subject_type,
          subject_id, subject_label, title, description, preview_url,
          due_date, expires_at, requested_by_staff_user_id, last_activity_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
       RETURNING id, approval_number`,
      [
        tenantId,
        clientId,
        b.projectId || null,
        approvalNumber,
        b.subjectType,
        b.subjectId || null,
        b.subjectLabel || null,
        b.title.trim(),
        b.description || null,
        b.previewUrl || null,
        b.dueDate || null,
        b.expiresAt || null,
        userId,
      ],
    );
    const id = ins.rows[0].id as string;

    // Approvers
    for (let i = 0; i < approversIn.length; i++) {
      const a = approversIn[i];
      if (
        (a.approverType === "portal" && !a.portalUserId) ||
        (a.approverType === "staff" && !a.staffUserId)
      ) {
        continue;
      }
      await pool.query(
        `INSERT INTO portal_approval_approvers
           (tenant_id, approval_id, approver_type, portal_user_id,
            staff_user_id, required, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          tenantId,
          id,
          a.approverType,
          a.approverType === "portal" ? a.portalUserId : null,
          a.approverType === "staff" ? a.staffUserId : null,
          a.required !== false,
          i,
        ],
      );
    }

    // Attachments
    if (Array.isArray(b.attachments) && b.attachments.length > 0) {
      try {
        const uploaded = await uploadApprovalAttachments(
          tenantId,
          id,
          b.attachments,
        );
        for (const u of uploaded) {
          await pool.query(
            `INSERT INTO portal_approval_attachments
               (tenant_id, approval_id, file_name, file_url, file_size_bytes,
                mime_type, uploaded_by_type, uploaded_by_staff_user_id)
             VALUES ($1,$2,$3,$4,$5,$6,'staff',$7)`,
            [
              tenantId,
              id,
              u.fileName,
              u.fileUrl,
              u.fileSize,
              u.mimeType,
              userId,
            ],
          );
        }
      } catch (err: any) {
        await logApprovalEvent(tenantId, id, "attachment_upload_failed", {
          actorType: "staff",
          actorStaffUserId: userId,
          payload: { error: err?.message || String(err) },
        });
      }
    }

    await logApprovalEvent(tenantId, id, "created", {
      actorType: "staff",
      actorStaffUserId: userId,
      payload: { approverCount: approversIn.length },
    });

    // Initial status compute (handles already-met approvals, e.g. zero
    // approvers → stays 'open' until someone is added).
    await recomputeApprovalStatus(tenantId, id);

    recordTransaction({
      req,
      parentEntityType: EntityType.CLIENT,
      parentEntityId: clientId,
      section: Section.ADMIN,
      module: Module.CLIENTS_V2,
      page: Page.CLIENT_DETAIL,
      action: Action.CREATE,
      actionLabel: `Created approval request: ${b.title.trim()}`,
      entityType: "approval_request",
      entityId: id,
      entityLabel: b.title.trim(),
    });

    res.status(201).json({
      success: true,
      data: { id, approvalNumber: ins.rows[0].approval_number },
    });
  }

  /** GET /api/approvals/:id (staff) */
  static async detail(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const data = await loadApprovalDetail(tenantId, req.params.id, "staff");
    if (!data) {
      res.status(404).json({ success: false, error: "Approval not found" });
      return;
    }
    res.json({ success: true, data });
  }

  /** DELETE /api/approvals/:id */
  static async deleteApproval(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM portal_approval_requests WHERE id = $1 AND tenant_id = $2 RETURNING client_id`,
      [id, tenantId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, error: "Approval not found" });
      return;
    }

    recordTransaction({
      req,
      parentEntityType: EntityType.CLIENT,
      parentEntityId: (result.rows[0] as any).client_id,
      section: Section.ADMIN,
      module: Module.CLIENTS_V2,
      page: Page.CLIENT_DETAIL,
      action: Action.DELETE,
      actionLabel: `Deleted approval request`,
      entityType: "approval_request",
      entityId: id,
      entityLabel: id,
    });

    res.json({ success: true });
  }

  /** PATCH /api/approvals/:id/cancel */
  static async cancel(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user?.id || null;
    const { id } = req.params;
    const cur = await pool.query(
      `SELECT status, client_id FROM portal_approval_requests
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (cur.rowCount === 0) {
      res.status(404).json({ success: false, error: "Approval not found" });
      return;
    }
    if (cur.rows[0].status === "cancelled") {
      res.json({ success: true, data: { id, status: "cancelled" } });
      return;
    }
    await pool.query(
      `UPDATE portal_approval_requests
          SET status = 'cancelled', last_activity_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    await logApprovalEvent(tenantId, id, "cancelled", {
      actorType: "staff",
      actorStaffUserId: userId,
    });
    recordTransaction({
      req,
      parentEntityType: EntityType.CLIENT,
      parentEntityId: cur.rows[0].client_id,
      section: Section.ADMIN,
      module: Module.CLIENTS_V2,
      page: Page.CLIENT_DETAIL,
      action: Action.UPDATE,
      actionLabel: `Cancelled approval request`,
      entityType: "approval_request",
      entityId: id,
      entityLabel: id,
    });
    res.json({ success: true, data: { id, status: "cancelled" } });
  }

  /**
   * POST /api/approvals/:id/approvers
   * body: { approverType: 'portal'|'staff', portalUserId?, staffUserId?, required? }
   */
  static async addApprover(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user?.id || null;
    const { id } = req.params;
    const b = req.body || {};

    const head = await pool.query(
      `SELECT client_id FROM portal_approval_requests
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (head.rowCount === 0) {
      res.status(404).json({ success: false, error: "Approval not found" });
      return;
    }
    if (b.approverType === "portal" && b.portalUserId) {
      const ok = await pool.query(
        `SELECT 1 FROM client_portal_users
          WHERE id = $1 AND tenant_id = $2 AND client_id = $3`,
        [b.portalUserId, tenantId, head.rows[0].client_id],
      );
      if (ok.rowCount === 0) {
        res.status(400).json({
          success: false,
          error: "Portal user is not on this client",
        });
        return;
      }
    }
    const posR = await pool.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
         FROM portal_approval_approvers
        WHERE approval_id = $1`,
      [id],
    );
    const ins = await pool.query(
      `INSERT INTO portal_approval_approvers
         (tenant_id, approval_id, approver_type, portal_user_id, staff_user_id,
          required, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
      [
        tenantId,
        id,
        b.approverType,
        b.approverType === "portal" ? b.portalUserId : null,
        b.approverType === "staff" ? b.staffUserId : null,
        b.required !== false,
        posR.rows[0].next_pos,
      ],
    );
    await logApprovalEvent(tenantId, id, "approver_added", {
      actorType: "staff",
      actorStaffUserId: userId,
      payload: {
        approverId: ins.rows[0].id,
        approverType: b.approverType,
      },
    });
    await recomputeApprovalStatus(tenantId, id);
    res.status(201).json({ success: true, data: { id: ins.rows[0].id } });
  }

  /** DELETE /api/approvals/:id/approvers/:approverId */
  static async removeApprover(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user?.id || null;
    const { id, approverId } = req.params;
    const r = await pool.query(
      `DELETE FROM portal_approval_approvers
        WHERE id = $1 AND approval_id = $2 AND tenant_id = $3`,
      [approverId, id, tenantId],
    );
    if (r.rowCount === 0) {
      res.status(404).json({ success: false, error: "Approver not found" });
      return;
    }
    await logApprovalEvent(tenantId, id, "approver_removed", {
      actorType: "staff",
      actorStaffUserId: userId,
      payload: { approverId },
    });
    await recomputeApprovalStatus(tenantId, id);
    res.json({ success: true });
  }
}

export default ApprovalsStaffController;
