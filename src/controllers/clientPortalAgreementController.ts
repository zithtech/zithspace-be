import { Request, Response } from "express";
import pool from "@/config/dbpool";

/**
 * Agreements, as the client sees them.
 *
 * WHAT A CLIENT MAY SEE is the whole design of this file. A draft is wording
 * somebody on our side is still arguing about; it must never appear here, and
 * the filter is applied in SQL rather than trusted to a caller. Everything
 * else that has left draft is fair game — it is their contract.
 *
 * TWO STATUSES ARE REPORTED, not one. `status` is where the document stands
 * (Pending, Active, Expired, Terminated) and `viewStatus` is whether anyone on
 * the client's side has opened it. They answer different questions and
 * collapsing them loses the one people actually chase: "did they read it?"
 * The invoice portal draws the same distinction — see decorateStatus there.
 */

/** Never leaves our side. Draft wording is not a document the client has. */
const CLIENT_VISIBLE_STATUSES = ["pending", "active", "expired", "terminated"];

const LIST_COLUMNS = `
  a.id,
  a.title,
  a.document_number   AS "documentNumber",
  a.document_type_name AS "documentTypeName",
  a.document_type_code AS "documentTypeCode",
  a.status,
  to_char(a.effective_date, 'YYYY-MM-DD') AS "effectiveDate",
  to_char(a.expiry_date,    'YYYY-MM-DD') AS "expiryDate",
  to_char(a.document_date,  'YYYY-MM-DD') AS "documentDate",
  a.total_value       AS "totalValue",
  a.value_currency    AS "valueCurrency",
  a.project_name      AS "projectName",
  a.portal_viewed_at  AS "portalViewedAt",
  a.pdf_url           AS "pdfUrl",
  a.updated_at        AS "updatedAt"
`;

/**
 * The second status: has the client opened it.
 *
 * Deliberately NOT folded into `status`. An agreement that is Active and
 * unread and one that is Active and read are the same contract in different
 * situations, and a single field cannot say both.
 */
function viewStatusOf(portalViewedAt: string | null): {
  viewStatus: "VIEWED" | "NOT_VIEWED";
  viewStatusLabel: string;
} {
  return portalViewedAt
    ? { viewStatus: "VIEWED", viewStatusLabel: "Viewed" }
    : { viewStatus: "NOT_VIEWED", viewStatusLabel: "Not viewed" };
}

const decorate = (row: any) => ({ ...row, ...viewStatusOf(row.portalViewedAt) });

export class ClientPortalAgreementController {
  /** GET /api/client-portal/agreements */
  static async list(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx?.clientId) {
      res.status(403).json({ success: false, error: "No client on this session" });
      return;
    }

    try {
      const r = await pool.query(
        `SELECT ${LIST_COLUMNS}
           FROM pa_agreements a
          WHERE a.tenant_id = $1
            AND a.client_id = $2
            AND a.deleted_at IS NULL
            AND a.status = ANY($3::text[])
          ORDER BY a.document_date DESC NULLS LAST, a.created_at DESC
          LIMIT 500`,
        [ctx.tenantId, ctx.clientId, CLIENT_VISIBLE_STATUSES],
      );

      const items = r.rows.map(decorate);
      res.json({
        success: true,
        data: {
          items,
          stats: {
            total: items.length,
            pending: items.filter((i: any) => i.status === "pending").length,
            active: items.filter((i: any) => i.status === "active").length,
            notViewed: items.filter((i: any) => i.viewStatus === "NOT_VIEWED").length,
          },
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Could not load agreements" });
    }
  }

  /**
   * GET /api/client-portal/agreements/:id
   *
   * Opening the record is what marks it viewed — the first time only, so the
   * timestamp keeps meaning "when this reached a human" rather than "when they
   * last refreshed".
   */
  static async detail(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx?.clientId) {
      res.status(403).json({ success: false, error: "No client on this session" });
      return;
    }

    try {
      const r = await pool.query(
        `SELECT ${LIST_COLUMNS}, a.content_html AS "contentHtml"
           FROM pa_agreements a
          WHERE a.tenant_id = $1
            AND a.client_id = $2
            AND a.id = $3
            AND a.deleted_at IS NULL
            AND a.status = ANY($4::text[])
          LIMIT 1`,
        [ctx.tenantId, ctx.clientId, req.params.id, CLIENT_VISIBLE_STATUSES],
      );
      if (r.rowCount === 0) {
        res.status(404).json({ success: false, error: "Agreement not found" });
        return;
      }

      // COALESCE, so a second open does not move the timestamp.
      await pool.query(
        `UPDATE pa_agreements
            SET portal_viewed_at = COALESCE(portal_viewed_at, now())
          WHERE tenant_id = $1 AND client_id = $2 AND id = $3`,
        [ctx.tenantId, ctx.clientId, req.params.id],
      );

      // Report the row as it now stands: the client just viewed it.
      const row = r.rows[0];
      res.json({
        success: true,
        data: decorate({ ...row, portalViewedAt: row.portalViewedAt ?? new Date().toISOString() }),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Could not load that agreement" });
    }
  }
}

export default ClientPortalAgreementController;
