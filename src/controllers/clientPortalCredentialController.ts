import { Response } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import pool from "@/config/dbpool";
import { AuthRequest } from "@/types";

// Generate a human-friendly temporary password: 4 lowercase blocks of 4 chars
// separated by hyphens, plus a digit. Examples: `quiet-river-flute-page-7`.
const WORDS = [
  "amber","atlas","azure","basil","beach","brave","brick","brisk","candor","clear",
  "cobalt","cosmic","crisp","crown","crystal","delta","ember","ever","fable","fern",
  "fjord","flute","forge","frost","gentle","grain","grove","harbor","haven","hazel",
  "horizon","ivory","jade","jolly","kettle","laurel","lemon","linen","lotus","lunar",
  "marine","meadow","merry","misty","nimble","north","ocean","olive","orchid","page",
  "pebble","piano","pine","plain","polar","prism","quiet","raven","river","robin",
  "rose","saffron","sage","silver","slate","solar","spring","stone","summer","swift",
  "tide","topaz","trail","umber","valley","velvet","vivid","walnut","willow","zephyr",
];

function generateTempPassword(): string {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  const digit = Math.floor(Math.random() * 10);
  return `${pick()}-${pick()}-${pick()}-${pick()}-${digit}`;
}

function generateUsername(seed: string): string {
  const base = seed.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 18) || "client";
  const suffix = randomBytes(2).toString("hex");
  return `${base}_${suffix}`;
}

export class ClientPortalCredentialController {
  /**
   * GET /api/clients-v2/:clientId/portal-users
   */
  static async list(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { clientId } = req.params;

    const r = await pool.query(
      `SELECT u.id, u.username, u.email, u.display_name, u.status,
              u.must_change_password, u.last_login_at, u.created_at,
              u.contact_id,
              ct.first_name, ct.last_name, ct.designation
         FROM client_portal_users u
         LEFT JOIN client_contacts_v2 ct ON ct.id = u.contact_id
        WHERE u.tenant_id = $1 AND u.client_id = $2
        ORDER BY u.created_at DESC`,
      [tenantId, clientId],
    );

    res.json({
      success: true,
      data: r.rows.map((row) => ({
        id: row.id,
        username: row.username,
        email: row.email,
        displayName:
          row.display_name ||
          [row.first_name, row.last_name].filter(Boolean).join(" ") ||
          row.username,
        designation: row.designation,
        contactId: row.contact_id,
        status: row.status,
        mustChangePassword: row.must_change_password,
        lastLoginAt: row.last_login_at,
        createdAt: row.created_at,
      })),
    });
  }

  /**
   * POST /api/clients-v2/:clientId/portal-users
   * body: { contactId?, email, displayName?, username? }
   * Returns the generated temp password ONCE — UI displays it and lets the
   * staff user copy it. We do not store the plaintext.
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { clientId } = req.params;
    const { contactId, email, displayName, username } = req.body || {};

    if (!email || typeof email !== "string") {
      res.status(400).json({ success: false, error: "email is required" });
      return;
    }

    // If contactId is supplied, verify it belongs to this client+tenant.
    if (contactId) {
      const c = await pool.query(
        `SELECT 1 FROM client_contacts_v2
          WHERE id = $1 AND tenant_id = $2 AND client_id = $3`,
        [contactId, tenantId, clientId],
      );
      if (c.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: "Contact not found on this client",
        });
        return;
      }
    }

    const dupe = await pool.query(
      `SELECT 1 FROM client_portal_users
        WHERE tenant_id = $1 AND LOWER(email) = LOWER($2)`,
      [tenantId, email],
    );
    if (dupe.rowCount && dupe.rowCount > 0) {
      res.status(409).json({
        success: false,
        error: "A portal user with that email already exists",
      });
      return;
    }

    const finalUsername =
      (username && String(username).trim()) ||
      generateUsername(email.split("@")[0] || "client");

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const insertRes = await pool.query(
      `INSERT INTO client_portal_users
         (tenant_id, client_id, contact_id, username, email, password_hash,
          display_name, status, must_change_password, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', TRUE, $8)
       RETURNING id, username, email, display_name, status, created_at`,
      [
        tenantId,
        clientId,
        contactId || null,
        finalUsername,
        email,
        passwordHash,
        displayName || null,
        req.user?.id || null,
      ],
    );

    const row = insertRes.rows[0];
    res.status(201).json({
      success: true,
      data: {
        id: row.id,
        username: row.username,
        email: row.email,
        displayName: row.display_name,
        status: row.status,
        createdAt: row.created_at,
        // Returned ONLY on create — never stored in plaintext.
        temporaryPassword: tempPassword,
      },
    });
  }

  /**
   * POST /api/clients-v2/portal-users/:portalUserId/reset-password
   * Generates a new temp password, returns it once.
   */
  static async resetPassword(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { portalUserId } = req.params;

    const exists = await pool.query(
      `SELECT id FROM client_portal_users WHERE id = $1 AND tenant_id = $2`,
      [portalUserId, tenantId],
    );
    if (exists.rowCount === 0) {
      res.status(404).json({ success: false, error: "Portal user not found" });
      return;
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await pool.query(
      `UPDATE client_portal_users
          SET password_hash = $1,
              must_change_password = TRUE,
              failed_login_count = 0,
              locked_until = NULL,
              updated_at = NOW()
        WHERE id = $2`,
      [passwordHash, portalUserId],
    );

    // Revoke all live sessions so the old password can't be used via cached refresh
    await pool.query(
      `UPDATE client_portal_sessions
          SET revoked_at = NOW()
        WHERE portal_user_id = $1 AND revoked_at IS NULL`,
      [portalUserId],
    );

    res.json({
      success: true,
      data: { temporaryPassword: tempPassword },
    });
  }

  /**
   * PATCH /api/clients-v2/portal-users/:portalUserId/status
   * body: { status: 'active' | 'disabled' }
   */
  static async updateStatus(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { portalUserId } = req.params;
    const { status } = req.body || {};

    if (status !== "active" && status !== "disabled") {
      res.status(400).json({
        success: false,
        error: "status must be 'active' or 'disabled'",
      });
      return;
    }

    const r = await pool.query(
      `UPDATE client_portal_users
          SET status = $1, updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3
        RETURNING id, status`,
      [status, portalUserId, tenantId],
    );
    if (r.rowCount === 0) {
      res.status(404).json({ success: false, error: "Portal user not found" });
      return;
    }

    if (status === "disabled") {
      await pool.query(
        `UPDATE client_portal_sessions
            SET revoked_at = NOW()
          WHERE portal_user_id = $1 AND revoked_at IS NULL`,
        [portalUserId],
      );
    }

    res.json({ success: true, data: r.rows[0] });
  }

  /**
   * DELETE /api/clients-v2/portal-users/:portalUserId
   */
  static async remove(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { portalUserId } = req.params;

    const r = await pool.query(
      `DELETE FROM client_portal_users WHERE id = $1 AND tenant_id = $2`,
      [portalUserId, tenantId],
    );
    if (r.rowCount === 0) {
      res.status(404).json({ success: false, error: "Portal user not found" });
      return;
    }
    res.json({ success: true });
  }
}

export default ClientPortalCredentialController;
