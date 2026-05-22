import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest } from "@/types";

/**
 * Staff-side: manage which billing `customers` rows are bound to a CRM
 * `clients_v2` row. Portal users inherit access to invoices via this link.
 */
export class ClientCustomerLinkController {
  /** GET /api/clients-v2/:clientId/billing-customers */
  static async listLinked(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { clientId } = req.params;
    const r = await pool.query(
      `SELECT id, company_name, email, phone, city, country, is_active, created_at
         FROM customers
        WHERE tenant_id = $1 AND client_id = $2
        ORDER BY company_name ASC`,
      [tenantId, clientId],
    );
    res.json({ success: true, data: r.rows });
  }

  /**
   * GET /api/clients-v2/:clientId/billing-customers/available?search=
   * Lists customers in the tenant that are *not* linked to any client yet
   * (or that are linked to this client). Used by the picker.
   */
  static async listAvailable(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { clientId } = req.params;
    const search = ((req.query.search as string) || "").trim();
    const params: any[] = [tenantId, clientId];
    let whereSearch = "";
    if (search) {
      params.push(`%${search}%`);
      whereSearch = `AND (company_name ILIKE $${params.length} OR email ILIKE $${params.length})`;
    }
    const r = await pool.query(
      `SELECT id, company_name, email, client_id
         FROM customers
        WHERE tenant_id = $1
          AND (client_id IS NULL OR client_id = $2)
          ${whereSearch}
        ORDER BY company_name ASC
        LIMIT 50`,
      params,
    );
    res.json({ success: true, data: r.rows });
  }

  /** POST /api/clients-v2/:clientId/billing-customers  body: { customerId } */
  static async link(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { clientId } = req.params;
    const { customerId } = req.body || {};
    if (!customerId) {
      res.status(400).json({ success: false, error: "customerId is required" });
      return;
    }

    const existing = await pool.query(
      `SELECT id, client_id FROM customers WHERE id = $1 AND tenant_id = $2`,
      [customerId, tenantId],
    );
    if (existing.rowCount === 0) {
      res.status(404).json({ success: false, error: "Customer not found" });
      return;
    }
    if (existing.rows[0].client_id && existing.rows[0].client_id !== clientId) {
      res.status(409).json({
        success: false,
        error: "Customer is already linked to a different client",
      });
      return;
    }

    await pool.query(
      `UPDATE customers
          SET client_id = $1, updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3`,
      [clientId, customerId, tenantId],
    );

    res.json({ success: true, data: { customerId, clientId } });
  }

  /** DELETE /api/clients-v2/:clientId/billing-customers/:customerId */
  static async unlink(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { clientId, customerId } = req.params;
    const r = await pool.query(
      `UPDATE customers
          SET client_id = NULL, updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2 AND client_id = $3
        RETURNING id`,
      [customerId, tenantId, clientId],
    );
    if (r.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: "Linked customer not found",
      });
      return;
    }
    res.json({ success: true });
  }
}

export default ClientCustomerLinkController;
