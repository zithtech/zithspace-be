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
      const { getBranding } = require("@/modules/project-agreements/repositories/branding.repo");
      const { getAgreement } = require("@/modules/project-agreements/repositories/agreement.repo");
      const { renderDocument } = require("@/modules/project-agreements/services/render.service");
      
      const tc = { query: pool.query.bind(pool), tenantId: ctx.tenantId } as any;

      // 1. Fetch the raw agreement from project-agreements module repo to get all fields
      const agreement = await getAgreement(tc, req.params.id);
      if (!agreement || agreement.clientId !== ctx.clientId || !CLIENT_VISIBLE_STATUSES.includes(agreement.status)) {
        res.status(404).json({ success: false, error: "Agreement not found" });
        return;
      }

      // Password Guard Check
      const { evaluateAgreementLockStatus, validateUnlockSession } = require("@/modules/project-agreements/services/passwordProtection.service");
      const lockEval = await evaluateAgreementLockStatus(tc, req.params.id);
      if (lockEval.isLocked) {
        const unlockToken = (req.headers['x-agreement-unlock-token'] as string) || (req.query.unlockToken as string);
        const isUnlocked = await validateUnlockSession(tc, req.params.id, unlockToken);
        if (!isUnlocked) {
          res.status(401).json({
            success: false,
            isLocked: true,
            error: "Password required to view this agreement",
            scope: lockEval.scope,
            data: {
              id: agreement.id,
              title: agreement.title,
              documentNumber: agreement.documentNumber,
              documentTypeName: agreement.documentTypeName,
              status: agreement.status,
            }
          });
          return;
        }
      }

      // COALESCE, so a second open does not move the timestamp.
      await pool.query(
        `UPDATE pa_agreements
            SET portal_viewed_at = COALESCE(portal_viewed_at, now())
          WHERE tenant_id = $1 AND client_id = $2 AND id = $3
          RETURNING portal_viewed_at AS "portalViewedAt"`,
        [ctx.tenantId, ctx.clientId, req.params.id],
      );
      
      // Update the agreement's viewed timestamp to the actual one (either just set or existing)
      const r = await pool.query(
        `SELECT portal_viewed_at AS "portalViewedAt" FROM pa_agreements WHERE id = $1`, [req.params.id]
      );
      const portalViewedAt = r.rows[0]?.portalViewedAt;

      // 2. Fetch branding
      const branding = await getBranding(tc);

      // 3. Render HTML
      const html = renderDocument({
        title: agreement.title,
        summaryTitle: agreement.summaryTitle,
        bodyHtml: agreement.contentHtml,
        documentNumber: agreement.documentNumber,
        effectiveDate: agreement.effectiveDate,
        client: agreement.partyName,
        clientCompany: agreement.clientCompany,
        clientEmail: agreement.partyEmail,
        clientPhone: agreement.partyPhone,
        kickoffDate: agreement.kickoffDate,
        documentDate: agreement.documentDate,
        totalValue: agreement.totalValue,
        valueCurrency: agreement.valueCurrency,
        summaryFields: agreement.summaryFields,
        signatoryName: agreement.signatoryName,
        signatoryPosition: agreement.signatoryPosition,
        signatoryCompany: agreement.signatoryCompany,
        clientSignatoryName: agreement.clientSignatoryName,
        clientSignatoryPosition: agreement.clientSignatoryPosition,
        clientSignatoryCompany: agreement.clientSignatoryCompany,
        clientSignatureUrl: agreement.clientSignatureUrl,
        showSignatures: agreement.showSignatures,
        branding,
      }, 'screen');

      res.json({
        success: true,
        data: decorate({ ...agreement, contentHtml: html, portalViewedAt: portalViewedAt ?? new Date().toISOString() }),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Could not load that agreement" });
    }
  }

  /**
   * GET /api/client-portal/agreements/:id/pdf
   *
   * Generate the PDF on the fly and stream it back.
   */
  static async downloadPdf(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx?.clientId) {
      res.status(403).json({ success: false, error: "No client on this session" });
      return;
    }

    try {
      const { getBranding } = require("@/modules/project-agreements/repositories/branding.repo");
      const { getAgreement } = require("@/modules/project-agreements/repositories/agreement.repo");
      const { renderDocument } = require("@/modules/project-agreements/services/render.service");
      const { renderPdfBuffer } = require("@/modules/project-agreements/services/pdf.service");
      
      const tc = { query: pool.query.bind(pool), tenantId: ctx.tenantId } as any;

      const agreement = await getAgreement(tc, req.params.id);
      if (!agreement || agreement.clientId !== ctx.clientId || !CLIENT_VISIBLE_STATUSES.includes(agreement.status)) {
        res.status(404).send("Agreement not found");
        return;
      }

      // Password Guard Check
      const { evaluateAgreementLockStatus, validateUnlockSession } = require("@/modules/project-agreements/services/passwordProtection.service");
      const lockEval = await evaluateAgreementLockStatus(tc, req.params.id);
      if (lockEval.isLocked) {
        const unlockToken = (req.headers['x-agreement-unlock-token'] as string) || (req.query.unlockToken as string);
        const isUnlocked = await validateUnlockSession(tc, req.params.id, unlockToken);
        if (!isUnlocked) {
          res.status(401).send("Password required to access this PDF");
          return;
        }
      }
      
      const branding = await getBranding(tc);

      const html = renderDocument({
        title: agreement.title,
        summaryTitle: agreement.summaryTitle,
        bodyHtml: agreement.contentHtml,
        documentNumber: agreement.documentNumber,
        effectiveDate: agreement.effectiveDate,
        client: agreement.partyName,
        clientCompany: agreement.clientCompany,
        clientEmail: agreement.partyEmail,
        clientPhone: agreement.partyPhone,
        kickoffDate: agreement.kickoffDate,
        documentDate: agreement.documentDate,
        totalValue: agreement.totalValue,
        valueCurrency: agreement.valueCurrency,
        summaryFields: agreement.summaryFields,
        signatoryName: agreement.signatoryName,
        signatoryPosition: agreement.signatoryPosition,
        signatoryCompany: agreement.signatoryCompany,
        clientSignatoryName: agreement.clientSignatoryName,
        clientSignatoryPosition: agreement.clientSignatoryPosition,
        clientSignatoryCompany: agreement.clientSignatoryCompany,
        clientSignatureUrl: agreement.clientSignatureUrl,
        showSignatures: agreement.showSignatures,
        branding,
      }, 'print');

      const pdf = await renderPdfBuffer(html);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${(agreement.documentNumber || agreement.title || 'agreement').replace(/[^a-zA-Z0-9.-]/g, "-")}.pdf"`);
      res.send(pdf);
    } catch (err: any) {
      console.error("Portal PDF Error:", err);
      res.status(500).send("Could not generate PDF");
    }
  }

  /**
   * POST /api/client-portal/agreements/:id/sign
   *
   * Client signs the agreement.
   */
  static async sign(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx?.clientId) {
      res.status(403).json({ success: false, error: "No client on this session" });
      return;
    }

    try {
      const { signatureUrl, signatureText } = req.body;
      let finalUrl = signatureUrl;
      
      if (signatureText && !signatureUrl) {
        const safeText = signatureText.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        finalUrl = `data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80"><text x="10" y="50" font-family="Caveat, Dancing Script, cursive" font-size="36" fill="black">${safeText}</text></svg>`;
      }

      if (!finalUrl) {
        res.status(400).json({ success: false, error: "Missing signature" });
        return;
      }

      // Password Guard Check
      const { evaluateAgreementLockStatus, validateUnlockSession } = require("@/modules/project-agreements/services/passwordProtection.service");
      const tc = { query: pool.query.bind(pool), tenantId: ctx.tenantId } as any;
      const lockEval = await evaluateAgreementLockStatus(tc, req.params.id);
      if (lockEval.isLocked) {
        const unlockToken = (req.headers['x-agreement-unlock-token'] as string) || (req.query.unlockToken as string);
        const isUnlocked = await validateUnlockSession(tc, req.params.id, unlockToken);
        if (!isUnlocked) {
          res.status(401).json({ success: false, error: "Password required to sign this agreement" });
          return;
        }
      }

      const textToSave = typeof signatureText === 'string' ? signatureText.trim() : null;
      const r = await pool.query(
        `UPDATE pa_agreements 
            SET client_signature_url = $1, 
                client_signatory_name = COALESCE(NULLIF($5, ''), client_signatory_name),
                client_signed_at = now()
          WHERE id = $2 AND client_id = $3 AND tenant_id = $4
          RETURNING *`,
        [finalUrl, req.params.id, ctx.clientId, ctx.tenantId, textToSave]
      );
      
      if (r.rowCount === 0) {
        res.status(404).json({ success: false, error: "Agreement not found" });
        return;
      }
      
      res.json({ success: true, data: { ...r.rows[0], clientSignatureUrl: finalUrl } });
    } catch (err: any) {
      console.error("Sign error:", err);
      res.status(500).json({ success: false, error: "Could not sign agreement" });
    }
  }

  /**
   * POST /api/client-portal/agreements/:id/unlock
   *
   * Unlock a protected agreement for the client.
   */
  static async unlock(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx?.clientId) {
      res.status(403).json({ success: false, error: "No client on this session" });
      return;
    }

    try {
      const { getAgreement } = require("@/modules/project-agreements/repositories/agreement.repo");
      const { verifyAndCreateUnlockSession } = require("@/modules/project-agreements/services/passwordProtection.service");
      const tc = { query: pool.query.bind(pool), tenantId: ctx.tenantId } as any;

      const agreement = await getAgreement(tc, req.params.id);
      if (!agreement || agreement.clientId !== ctx.clientId || !CLIENT_VISIBLE_STATUSES.includes(agreement.status)) {
        res.status(404).json({ success: false, error: "Agreement not found" });
        return;
      }

      const { password } = req.body;
      if (!password || typeof password !== 'string') {
        res.status(400).json({ success: false, error: "Password is required" });
        return;
      }

      const ipAddress = req.ip || req.headers['x-forwarded-for']?.toString() || '0.0.0.0';
      const result = await verifyAndCreateUnlockSession(tc, req.params.id, password, {
        actorId: ctx.clientId,
        actorType: 'CLIENT_USER',
        ipAddress,
        userAgent: req.headers['user-agent'],
      });

      res.setHeader('X-Agreement-Unlock-Token', result.token);
      res.json({
        success: true,
        data: {
          unlockToken: result.token,
          expiresAt: result.expiresAt,
        }
      });
    } catch (err: any) {
      res.status(401).json({ success: false, error: err?.message || "Invalid password" });
    }
  }
}

export default ClientPortalAgreementController;

