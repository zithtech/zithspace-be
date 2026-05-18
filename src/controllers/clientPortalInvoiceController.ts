import { Request, Response } from "express";
import { nanoid } from "nanoid";
import pool from "@/config/dbpool";
import {
  s3Client,
  BUCKET_NAME,
} from "@/utils/r2Client";
import { PutObjectCommand } from "@aws-sdk/client-s3";

/* ----------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

const CLIENT_VISIBLE_STATUSES = new Set([
  "SENT",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELLED",
]);

/**
 * Returns the list of billing-customer ids linked to a portal user's CRM
 * client. Any invoice belonging to one of these customers is visible to that
 * portal user.
 */
async function customersForPortalUser(
  tenantId: string,
  clientId: string,
): Promise<string[]> {
  const r = await pool.query(
    `SELECT id FROM customers WHERE tenant_id = $1 AND client_id = $2`,
    [tenantId, clientId],
  );
  return r.rows.map((row) => row.id);
}

/**
 * Computed status for the client portal. Adds "VIEWED" on top of the existing
 * invoice status enum when the portal user has opened the invoice but hasn't
 * paid yet.
 */
function decorateStatus(
  rawStatus: string,
  viewedAt: string | null,
  dueDate: string | null,
): {
  status: string;
  isOverdue: boolean;
} {
  const status = String(rawStatus || "").toUpperCase();

  // Real "OVERDUE" is computed: SENT and past due.
  let isOverdue = false;
  if (
    (status === "SENT" || status === "PARTIALLY_PAID") &&
    dueDate &&
    new Date(dueDate) < new Date()
  ) {
    isOverdue = true;
  }

  if (isOverdue) return { status: "OVERDUE", isOverdue: true };
  if (status === "SENT" && viewedAt) {
    return { status: "VIEWED", isOverdue: false };
  }
  return { status, isOverdue: false };
}

async function ensurePortalContext(
  req: Request,
  res: Response,
): Promise<{ tenantId: string; clientId: string; portalUserId: string } | null> {
  const ctx = req.portalUser;
  if (!ctx) {
    res.status(401).json({ success: false, error: "Not authenticated" });
    return null;
  }
  return {
    tenantId: ctx.tenantId,
    clientId: ctx.clientId,
    portalUserId: ctx.portalUserId,
  };
}

/* ----------------------------------------------------------------------
 * Controller
 * ---------------------------------------------------------------------- */

export class ClientPortalInvoiceController {
  /**
   * GET /api/client-portal/invoices?status=&search=&page=&limit=
   * Lists invoices scoped to billing customers linked to the portal user's
   * client. Excludes DRAFT (and any other not-yet-client-visible state).
   */
  static async list(req: Request, res: Response): Promise<void> {
    const ctx = await ensurePortalContext(req, res);
    if (!ctx) return;

    const customerIds = await customersForPortalUser(ctx.tenantId, ctx.clientId);
    if (customerIds.length === 0) {
      res.json({
        success: true,
        data: [],
        meta: {
          page: 1,
          limit: 0,
          total: 0,
          summary: {
            totalInvoices: 0,
            totalBalanceDue: 0,
            currency: null,
            counts: {},
          },
        },
      });
      return;
    }

    const statusFilter = ((req.query.status as string) || "").toUpperCase();
    const search = ((req.query.search as string) || "").trim();
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
    );
    const offset = (page - 1) * limit;

    // Build params/where shared by count and list. $1=tenantId, $2=customerIds,
    // $3=portalUserId (used by the LEFT JOIN and the VIEWED EXISTS clause).
    const listParams: any[] = [ctx.tenantId, customerIds, ctx.portalUserId];
    let listWhere = `WHERE i.tenant_id = $1
                       AND i.customer_id = ANY($2::text[])
                       AND i.deleted_at IS NULL
                       AND i.status::text NOT IN ('DRAFT','PENDING','APPROVAL','SUBMITTED')`;
    if (statusFilter === "OVERDUE") {
      listWhere += ` AND i.due_date < NOW() AND i.status::text IN ('SENT','PARTIALLY_PAID')`;
    } else if (statusFilter === "VIEWED") {
      listWhere += ` AND i.status::text = 'SENT' AND EXISTS (
                       SELECT 1 FROM invoice_portal_views v2
                        WHERE v2.invoice_id = i.id AND v2.portal_user_id = $3
                     )`;
    } else if (statusFilter && statusFilter !== "ALL") {
      listParams.push(statusFilter);
      listWhere += ` AND i.status::text = $${listParams.length}`;
    }
    if (search) {
      listParams.push(`%${search}%`);
      listWhere += ` AND (i.invoice_number ILIKE $${listParams.length} OR COALESCE(i.description,'') ILIKE $${listParams.length})`;
    }

    // Count uses the same params so paging stays consistent
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM invoices i ${listWhere}`,
      listParams,
    );
    const total = countRes.rows[0]?.n || 0;

    listParams.push(limit);
    listParams.push(offset);

    const r = await pool.query(
      `SELECT i.id, i.invoice_number, i.invoice_date, i.due_date, i.currency,
              i.subtotal, i.tax_total, i.discount_total, i.grand_total,
              i.balance_due, i.paid_amount, i.status::text AS status,
              i.sent_at, i.paid_at, i.cancelled_at, i.description,
              v.first_viewed_at AS viewed_at,
              c.company_name AS customer_name
         FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
         LEFT JOIN invoice_portal_views v
                ON v.invoice_id = i.id AND v.portal_user_id = $3
         ${listWhere}
         ORDER BY i.invoice_date DESC, i.created_at DESC
         LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    );

    // Summary across the whole scope (ignoring filters for headline numbers)
    const sumRes = await pool.query(
      `SELECT i.status::text AS status, COUNT(*)::int AS n,
              COALESCE(SUM(i.balance_due),0)::numeric AS balance,
              COALESCE(SUM(i.grand_total),0)::numeric AS gross,
              MAX(i.currency) AS currency
         FROM invoices i
        WHERE i.tenant_id = $1
          AND i.customer_id = ANY($2::text[])
          AND i.deleted_at IS NULL
          AND i.status::text NOT IN ('DRAFT','PENDING','APPROVAL','SUBMITTED')
        GROUP BY i.status::text`,
      [ctx.tenantId, customerIds],
    );

    const counts: Record<string, number> = {};
    let totalBalanceDue = 0;
    let totalInvoices = 0;
    let currency: string | null = null;
    for (const row of sumRes.rows) {
      counts[row.status] = row.n;
      totalBalanceDue += Number(row.balance) || 0;
      totalInvoices += row.n;
      if (!currency) currency = row.currency;
    }

    res.json({
      success: true,
      data: r.rows.map((row) => {
        const decorated = decorateStatus(row.status, row.viewed_at, row.due_date);
        return {
          id: row.id,
          invoiceNumber: row.invoice_number,
          invoiceDate: row.invoice_date,
          dueDate: row.due_date,
          currency: row.currency,
          subtotal: row.subtotal,
          taxTotal: row.tax_total,
          discountTotal: row.discount_total,
          grandTotal: row.grand_total,
          balanceDue: row.balance_due,
          paidAmount: row.paid_amount,
          rawStatus: row.status,
          status: decorated.status,
          isOverdue: decorated.isOverdue,
          viewedAt: row.viewed_at,
          sentAt: row.sent_at,
          paidAt: row.paid_at,
          cancelledAt: row.cancelled_at,
          description: row.description,
          customerName: row.customer_name,
        };
      }),
      meta: {
        page,
        limit,
        total,
        summary: {
          totalInvoices,
          totalBalanceDue,
          currency,
          counts,
        },
      },
    });
  }

  /**
   * GET /api/client-portal/invoices/:id
   * Returns full invoice + line items + taxes + payments + attachments +
   * payment-proofs. Records a portal-view in the process.
   */
  static async detail(req: Request, res: Response): Promise<void> {
    const ctx = await ensurePortalContext(req, res);
    if (!ctx) return;
    const { id } = req.params;

    const customerIds = await customersForPortalUser(ctx.tenantId, ctx.clientId);
    if (customerIds.length === 0) {
      res.status(404).json({ success: false, error: "Invoice not found" });
      return;
    }

    const invRes = await pool.query(
      `SELECT i.id, i.invoice_number, i.invoice_date, i.due_date, i.currency,
              i.subtotal, i.tax_total, i.discount_total, i.grand_total,
              i.balance_due, i.paid_amount, i.status::text AS status,
              i.sent_at, i.paid_at, i.cancelled_at, i.description,
              i.notes, i.terms, i.pdf_url, i.invoice_type::text AS invoice_type,
              i.customer_snapshot,
              c.company_name AS customer_name, c.email AS customer_email,
              c.address AS customer_address, c.city AS customer_city,
              c.country AS customer_country, c.tax_id AS customer_tax_id
         FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
        WHERE i.id = $1 AND i.tenant_id = $2
          AND i.customer_id = ANY($3::text[])
          AND i.deleted_at IS NULL
          AND i.status::text NOT IN ('DRAFT','PENDING','APPROVAL','SUBMITTED')`,
      [id, ctx.tenantId, customerIds],
    );

    const invoice = invRes.rows[0];
    if (!invoice) {
      res.status(404).json({ success: false, error: "Invoice not found" });
      return;
    }

    // Record view
    await pool.query(
      `INSERT INTO invoice_portal_views
         (tenant_id, invoice_id, portal_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (invoice_id, portal_user_id) DO UPDATE
          SET last_viewed_at = NOW(),
              view_count = invoice_portal_views.view_count + 1`,
      [ctx.tenantId, id, ctx.portalUserId],
    );

    const [lineItems, taxes, payments, attachments, proofs] = await Promise.all([
      pool.query(
        `SELECT id, item_name, description, quantity, rate, tax_rate,
                row_number, hours, subtotal, tax_amount, total
           FROM invoice_line_items
          WHERE invoice_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
          ORDER BY row_number ASC NULLS LAST, created_at ASC`,
        [id, ctx.tenantId],
      ),
      pool.query(
        `SELECT id, tax_name, tax_rate, tax_amount
           FROM invoice_taxes
          WHERE invoice_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
          ORDER BY created_at ASC`,
        [id, ctx.tenantId],
      ),
      pool.query(
        `SELECT id, amount, description, payment_date,
                payment_method::text AS payment_method,
                status::text AS status, reference_id, created_at
           FROM invoice_payments
          WHERE invoice_id = $1 AND tenant_id = $2
          ORDER BY payment_date DESC, created_at DESC`,
        [id, ctx.tenantId],
      ),
      pool.query(
        `SELECT id, file_name, file_url, uploaded_at
           FROM invoice_attachments
          WHERE invoice_id = $1
          ORDER BY uploaded_at DESC NULLS LAST`,
        [id],
      ),
      pool.query(
        `SELECT id, amount, payment_date, reference, note,
                file_url, file_name, file_size_bytes, mime_type,
                status, review_note, created_at
           FROM invoice_payment_proofs
          WHERE invoice_id = $1 AND tenant_id = $2
          ORDER BY created_at DESC`,
        [id, ctx.tenantId],
      ),
    ]);

    const decorated = decorateStatus(
      invoice.status,
      new Date().toISOString(),
      invoice.due_date,
    );

    res.json({
      success: true,
      data: {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        invoiceDate: invoice.invoice_date,
        dueDate: invoice.due_date,
        currency: invoice.currency,
        invoiceType: invoice.invoice_type,
        subtotal: invoice.subtotal,
        taxTotal: invoice.tax_total,
        discountTotal: invoice.discount_total,
        grandTotal: invoice.grand_total,
        balanceDue: invoice.balance_due,
        paidAmount: invoice.paid_amount,
        rawStatus: invoice.status,
        status: decorated.status,
        isOverdue: decorated.isOverdue,
        sentAt: invoice.sent_at,
        paidAt: invoice.paid_at,
        cancelledAt: invoice.cancelled_at,
        description: invoice.description,
        notes: invoice.notes,
        terms: invoice.terms,
        pdfUrl: invoice.pdf_url,
        customer: {
          name: invoice.customer_name,
          email: invoice.customer_email,
          address: invoice.customer_address,
          city: invoice.customer_city,
          country: invoice.customer_country,
          taxId: invoice.customer_tax_id,
        },
        customerSnapshot: invoice.customer_snapshot,
        lineItems: lineItems.rows,
        taxes: taxes.rows,
        payments: payments.rows,
        attachments: attachments.rows,
        paymentProofs: proofs.rows,
      },
    });
  }

  /**
   * POST /api/client-portal/invoices/:id/payment-proofs
   * body: { file: base64DataUrl, fileName, amount?, paymentDate?, reference?, note? }
   */
  static async uploadPaymentProof(req: Request, res: Response): Promise<void> {
    const ctx = await ensurePortalContext(req, res);
    if (!ctx) return;
    const { id } = req.params;
    const { file, fileName, amount, paymentDate, reference, note } =
      req.body || {};

    if (!file || typeof file !== "string") {
      res.status(400).json({ success: false, error: "file is required" });
      return;
    }

    const customerIds = await customersForPortalUser(ctx.tenantId, ctx.clientId);
    if (customerIds.length === 0) {
      res.status(404).json({ success: false, error: "Invoice not found" });
      return;
    }

    // Verify ownership
    const inv = await pool.query(
      `SELECT id FROM invoices
        WHERE id = $1 AND tenant_id = $2 AND customer_id = ANY($3::text[])`,
      [id, ctx.tenantId, customerIds],
    );
    if (inv.rowCount === 0) {
      res.status(404).json({ success: false, error: "Invoice not found" });
      return;
    }

    const match = file.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      res.status(400).json({
        success: false,
        error: "file must be a base64 data URL (data:<mime>;base64,...)",
      });
      return;
    }

    const contentType = match[1];
    const buffer = Buffer.from(match[2], "base64");
    const sizeMb = buffer.length / (1024 * 1024);
    if (sizeMb > 10) {
      res
        .status(413)
        .json({ success: false, error: "File exceeds 10 MB limit" });
      return;
    }

    const safeName =
      (fileName || `proof_${Date.now()}`).replace(/[^a-zA-Z0-9.-]/g, "_") || "proof";
    const uniqueId = nanoid(12);
    const key = `${ctx.tenantId}/client-portal/payment-proofs/${id}/${uniqueId}_${safeName}`;

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
    const fileUrl = `${publicBase}/${key}`;

    const insertRes = await pool.query(
      `INSERT INTO invoice_payment_proofs
         (tenant_id, invoice_id, portal_user_id, amount, payment_date,
          reference, note, file_url, file_name, file_size_bytes, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, amount, payment_date, reference, note, file_url,
                 file_name, file_size_bytes, mime_type, status, created_at`,
      [
        ctx.tenantId,
        id,
        ctx.portalUserId,
        amount ?? null,
        paymentDate ?? null,
        reference ?? null,
        note ?? null,
        fileUrl,
        safeName,
        buffer.length,
        contentType,
      ],
    );

    res.status(201).json({ success: true, data: insertRes.rows[0] });
  }
}

export default ClientPortalInvoiceController;
