import { Request, Response } from "express";
import pool from "@/config/dbpool";
import {
  recomputeApprovalStatus,
  logApprovalEvent,
  loadApprovalDetail,
} from "./approvalsShared";

/**
 * Portal-side view of approvals. We surface every approval where the portal
 * user's CRM client owns the approval AND the portal user is a named
 * approver — plus a list mode for "any approval on my company" so users with
 * broader access can browse. Decisions are scoped to the user as an
 * approver row.
 */
export class ClientPortalApprovalsController {
  /**
   * GET /api/client-portal/approvals?status=&mine=&page=&limit=
   * `mine=true` (default) → only approvals where the user is an approver.
   */
  static async list(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    const status = ((req.query.status as string) || "").toLowerCase();
    const mine = req.query.mine !== "false"; // default true
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
    );
    const offset = (page - 1) * limit;

    const params: any[] = [ctx.tenantId, ctx.clientId];
    let where = `WHERE a.tenant_id = $1 AND a.client_id = $2`;
    if (mine) {
      params.push(ctx.portalUserId);
      where += ` AND EXISTS (
                   SELECT 1 FROM portal_approval_approvers ap
                    WHERE ap.approval_id = a.id
                      AND ap.portal_user_id = $${params.length}
                 )`;
    }
    if (status && status !== "all") {
      params.push(status);
      where += ` AND a.status = $${params.length}`;
    }

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM portal_approval_requests a ${where}`,
      params,
    );
    const total = countRes.rows[0]?.n || 0;

    params.push(limit);
    params.push(offset);

    // Add me-specific decision so the FE can highlight "needs my decision"
    const meParam = mine ? ctx.portalUserId : null;
    if (!mine) {
      params.push(ctx.portalUserId);
    }
    const meIdx = mine ? params.indexOf(ctx.portalUserId) + 1 : params.length;

    const list = await pool.query(
      `SELECT a.id, a.approval_number, a.title, a.subject_type, a.subject_label,
              a.status, a.due_date, a.expires_at, a.last_activity_at,
              a.created_at, a.preview_url,
              a.project_id, p.name AS project_name,
              (SELECT COUNT(*)::int FROM portal_approval_approvers ap
                WHERE ap.approval_id = a.id AND ap.required = TRUE)
                AS required_count,
              (SELECT COUNT(*)::int FROM portal_approval_approvers ap
                WHERE ap.approval_id = a.id AND ap.required = TRUE
                  AND ap.decision = 'approved') AS approved_count,
              (SELECT COUNT(*)::int FROM portal_approval_approvers ap
                WHERE ap.approval_id = a.id AND ap.required = TRUE
                  AND ap.decision = 'rejected') AS rejected_count,
              (SELECT decision FROM portal_approval_approvers ap
                WHERE ap.approval_id = a.id
                  AND ap.portal_user_id = $${meIdx}) AS my_decision
         FROM portal_approval_requests a
         LEFT JOIN projects p ON p.id = a.project_id
         ${where}
         ORDER BY
           CASE WHEN a.status = 'open' THEN 0 ELSE 1 END,
           a.last_activity_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    // Status counts for filter pills — always restricted to portal user
    const counts = await pool.query(
      `SELECT a.status, COUNT(*)::int AS n
         FROM portal_approval_requests a
        WHERE a.tenant_id = $1 AND a.client_id = $2
          AND EXISTS (
            SELECT 1 FROM portal_approval_approvers ap
             WHERE ap.approval_id = a.id
               AND ap.portal_user_id = $3
          )
        GROUP BY a.status`,
      [ctx.tenantId, ctx.clientId, ctx.portalUserId],
    );
    const countMap: Record<string, number> = {};
    for (const row of counts.rows) countMap[row.status] = row.n;

    res.json({
      success: true,
      data: list.rows.map((row) => ({
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
        previewUrl: row.preview_url,
        projectId: row.project_id,
        projectName: row.project_name,
        requiredCount: row.required_count || 0,
        approvedCount: row.approved_count || 0,
        rejectedCount: row.rejected_count || 0,
        myDecision: row.my_decision || null,
      })),
      meta: { total, page, limit, counts: countMap, mine: meParam !== null },
    });
  }

  /** GET /api/client-portal/approvals/:id */
  static async detail(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    const data = await loadApprovalDetail(
      ctx.tenantId,
      req.params.id,
      "portal",
      ctx.clientId,
    );
    if (!data) {
      res.status(404).json({ success: false, error: "Approval not found" });
      return;
    }

    // Surface this user's approver row separately for the UI
    const myApproverRow =
      data.approvers.find(
        (a: any) => a.portalUserId === ctx.portalUserId,
      ) || null;

    res.json({ success: true, data: { ...data, me: myApproverRow } });
  }

  /**
   * POST /api/client-portal/approvals/:id/decision
   * body: { decision: 'approved' | 'rejected', note? }
   *
   * Posts the decision against the caller's approver row. If the user is not
   * listed as an approver on this request, 403. If they've already decided,
   * 409.
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

    // Confirm the approval belongs to this client + has the user as approver
    const head = await pool.query(
      `SELECT a.status FROM portal_approval_requests a
        WHERE a.id = $1 AND a.tenant_id = $2 AND a.client_id = $3`,
      [id, ctx.tenantId, ctx.clientId],
    );
    if (head.rowCount === 0) {
      res.status(404).json({ success: false, error: "Approval not found" });
      return;
    }
    if (
      ["cancelled", "expired"].includes(head.rows[0].status)
    ) {
      res.status(409).json({
        success: false,
        error: `Approval is ${head.rows[0].status}`,
      });
      return;
    }

    const myRow = await pool.query(
      `SELECT id, decision FROM portal_approval_approvers
        WHERE approval_id = $1 AND tenant_id = $2 AND portal_user_id = $3`,
      [id, ctx.tenantId, ctx.portalUserId],
    );
    if (myRow.rowCount === 0) {
      res.status(403).json({
        success: false,
        error: "You are not listed as an approver on this request",
      });
      return;
    }
    if (myRow.rows[0].decision) {
      res.status(409).json({
        success: false,
        error: `You already ${myRow.rows[0].decision}`,
      });
      return;
    }

    await pool.query(
      `UPDATE portal_approval_approvers
          SET decision = $1, decision_note = $2, decided_at = NOW()
        WHERE id = $3 AND tenant_id = $4`,
      [decision, note || null, myRow.rows[0].id, ctx.tenantId],
    );

    await logApprovalEvent(ctx.tenantId, id, "approver_decision", {
      actorType: "portal",
      actorPortalId: ctx.portalUserId,
      payload: { decision, note: note || null },
    });

    const newStatus = await recomputeApprovalStatus(ctx.tenantId, id);

    res.json({
      success: true,
      data: { id, myDecision: decision, status: newStatus },
    });
  }
}

export default ClientPortalApprovalsController;
