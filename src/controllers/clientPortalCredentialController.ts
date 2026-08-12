import { recordTransaction, Section, Module, Page, Action, EntityType } from "@/utils/transactionHistory";
import { Response } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import pool from "@/config/dbpool";
import { AuthRequest } from "@/types";
import { emailService } from "@/utils/emailService";
import { socketService } from "@/services/socketService";
import { entitlementService, EntitlementError } from "@/services/EntitlementService";

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
              u.contact_id, u.created_by,
              ct.first_name, ct.last_name, ct.designation,
              uc.name AS creator_name, uc.avatar_url AS creator_avatar_url
         FROM client_portal_users u
         LEFT JOIN client_contacts_v2 ct ON ct.id = u.contact_id
         LEFT JOIN users uc ON uc.id = u.created_by
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
        createdBy: row.created_by ? {
          id: row.created_by,
          name: row.creator_name || '—',
          avatarUrl: row.creator_avatar_url || null,
        } : null,
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

    try {
      await entitlementService.checkLimit(tenantId, "client_portal_users");
    } catch (err: any) {
      if (err instanceof EntitlementError) {
        res.status(403).json({
          success: false,
          error: "You have reached the maximum number of client portal users allowed on your current plan.",
          details: { current: err.current, allowed: err.allowed },
        });
        return;
      }
      throw err;
    }

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
    socketService.emitToClient(tenantId, clientId, "portal_user:created", {
      clientId,
      id: row.id,
    });

    const portalUrl = req.body.portalUrl || `${process.env.FRONTEND_URL || "http://localhost:3000"}/portal/login`;
    try {
      await emailService.sendPortalWelcomeEmail(
        {
          to: row.email,
          displayName: row.display_name,
          username: row.username,
          temporaryPassword: tempPassword,
          portalUrl,
        },
        tenantId,
      );
    } catch (err) {
      console.error("❌ Failed to send client portal welcome email:", err);
    }

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

    const existing = await pool.query(
      `SELECT id, email, username, display_name, client_id
         FROM client_portal_users
        WHERE id = $1 AND tenant_id = $2`,
      [portalUserId, tenantId],
    );
    if (existing.rowCount === 0) {
      res.status(404).json({ success: false, error: "Portal user not found" });
      return;
    }
    const user = existing.rows[0];

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

    const portalUrl = req.body.portalUrl || `${process.env.FRONTEND_URL || "http://localhost:3000"}/portal/login`;
    let emailSent = false;
    try {
      emailSent = await emailService.sendPortalPasswordResetEmail(
        {
          to: user.email,
          displayName: user.display_name,
          username: user.username,
          temporaryPassword: tempPassword,
          portalUrl,
        },
        tenantId,
      );
    } catch (err) {
      console.error("❌ Failed to send portal password reset email:", err);
    }

    socketService.emitToClient(
      tenantId,
      user.client_id,
      "portal_user:updated",
      { clientId: user.client_id, id: portalUserId, kind: "password_reset" },
    );

    recordTransaction({
      req,
      parentEntityType: EntityType.CLIENT,
      parentEntityId: user.client_id,
      section: Section.ADMIN,
      module: Module.CLIENTS_V2,
      page: Page.CLIENT_DETAIL,
      action: Action.UPDATE,
      actionLabel: `Reset portal access password`,
      entityType: "portal_user",
      entityId: portalUserId,
      entityLabel: portalUserId,
    });
    res.json({
      success: true,
      data: { temporaryPassword: tempPassword, emailSent },
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
        RETURNING id, status, client_id`,
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

    const updated = r.rows[0];
    socketService.emitToClient(
      tenantId,
      updated.client_id,
      "portal_user:updated",
      { clientId: updated.client_id, id: updated.id, kind: "status" },
    );

    recordTransaction({
      req,
      parentEntityType: EntityType.CLIENT,
      parentEntityId: updated.client_id,
      section: Section.ADMIN,
      module: Module.CLIENTS_V2,
      page: Page.CLIENT_DETAIL,
      action: Action.UPDATE,
      actionLabel: `Updated portal access status`,
      entityType: "portal_user",
      entityId: portalUserId,
      entityLabel: portalUserId,
    });

    res.json({
      success: true,
      data: { id: updated.id, status: updated.status },
    });
  }

  /**
   * DELETE /api/clients-v2/portal-users/:portalUserId
   */
  static async remove(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { portalUserId } = req.params;

    const r = await pool.query(
      `DELETE FROM client_portal_users WHERE id = $1 AND tenant_id = $2
       RETURNING client_id`,
      [portalUserId, tenantId],
    );
    if (r.rowCount === 0) {
      res.status(404).json({ success: false, error: "Portal user not found" });
      return;
    }
    const clientId = (r.rows[0] as any).client_id as string;
    socketService.emitToClient(tenantId, clientId, "portal_user:deleted", {
      clientId,
      id: portalUserId,
    });

    recordTransaction({
      req,
      parentEntityType: EntityType.CLIENT,
      parentEntityId: clientId,
      section: Section.ADMIN,
      module: Module.CLIENTS_V2,
      page: Page.CLIENT_DETAIL,
      action: Action.DELETE,
      actionLabel: `Deleted portal access`,
      entityType: "portal_user",
      entityId: portalUserId,
      entityLabel: portalUserId,
    });

    res.json({ success: true });
  }
}

export default ClientPortalCredentialController;
