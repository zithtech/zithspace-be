import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import pool from "@/config/dbpool";
import ClientPortalJWT from "@/utils/clientPortalJwt";
import { AuthRequest } from "@/types";

const COOKIE_NAME = "clientPortalRefresh";
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

async function recordAudit(
  tenantId: string,
  event: string,
  opts: {
    portalUserId?: string | null;
    username?: string | null;
    req: Request;
    detail?: string;
  },
) {
  try {
    await pool.query(
      `INSERT INTO client_portal_login_audit
         (tenant_id, portal_user_id, username, event, ip_address, user_agent, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        tenantId,
        opts.portalUserId || null,
        opts.username || null,
        event,
        opts.req.ip || null,
        (opts.req.headers["user-agent"] as string) || null,
        opts.detail || null,
      ],
    );
  } catch (err) {
    console.error("client portal audit insert failed:", err);
  }
}

export class ClientPortalAuthController {
  /**
   * POST /api/client-portal/auth/login
   * Requires tenant context (resolved by `resolveTenant` middleware).
   * Accepts either `username` or `email` as the identifier.
   */
  static async login(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(400).json({
        success: false,
        error: "Tenant context required",
        code: "TENANT_REQUIRED",
      });
      return;
    }

    const { identifier, username, email, password } = req.body || {};
    const id = (identifier || username || email || "").toString().trim();
    if (!id || !password) {
      res.status(400).json({
        success: false,
        error: "Identifier and password are required",
      });
      return;
    }

    const userRes = await pool.query(
      `SELECT id, tenant_id, client_id, contact_id, username, email,
              password_hash, display_name, status, must_change_password,
              failed_login_count, locked_until
         FROM client_portal_users
        WHERE tenant_id = $1
          AND (LOWER(username) = LOWER($2) OR LOWER(email) = LOWER($2))
        LIMIT 1`,
      [tenantId, id],
    );

    const user = userRes.rows[0];

    if (!user) {
      await recordAudit(tenantId, "login_failed", {
        username: id,
        req,
        detail: "user_not_found",
      });
      res.status(401).json({ success: false, error: "Invalid credentials" });
      return;
    }

    if (user.status !== "active") {
      await recordAudit(tenantId, "login_blocked", {
        portalUserId: user.id,
        username: user.username,
        req,
        detail: `status=${user.status}`,
      });
      res.status(403).json({
        success: false,
        error: "Portal access is disabled. Please contact your account manager.",
      });
      return;
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      res.status(429).json({
        success: false,
        error: "Account temporarily locked. Try again later.",
        code: "PORTAL_USER_LOCKED",
      });
      return;
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      const newFailed = (user.failed_login_count || 0) + 1;
      const shouldLock = newFailed >= MAX_FAILED;
      await pool.query(
        `UPDATE client_portal_users
            SET failed_login_count = $1,
                locked_until = CASE WHEN $2::bool
                                    THEN NOW() + ($3 || ' minutes')::interval
                                    ELSE locked_until END,
                updated_at = NOW()
          WHERE id = $4`,
        [newFailed, shouldLock, String(LOCK_MINUTES), user.id],
      );
      await recordAudit(tenantId, "login_failed", {
        portalUserId: user.id,
        username: user.username,
        req,
        detail: `bad_password (count=${newFailed})`,
      });
      res.status(401).json({ success: false, error: "Invalid credentials" });
      return;
    }

    const { accessToken, refreshToken, refreshExpiresAt } =
      ClientPortalJWT.generateTokenPair({
        portalUserId: user.id,
        tenantId: user.tenant_id,
        clientId: user.client_id,
        contactId: user.contact_id,
        username: user.username,
        email: user.email,
      });

    await pool.query(
      `INSERT INTO client_portal_sessions
         (tenant_id, portal_user_id, refresh_token, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        tenantId,
        user.id,
        refreshToken,
        (req.headers["user-agent"] as string) || null,
        req.ip || null,
        refreshExpiresAt,
      ],
    );

    await pool.query(
      `UPDATE client_portal_users
          SET last_login_at = NOW(),
              last_login_ip = $1,
              failed_login_count = 0,
              locked_until = NULL,
              updated_at = NOW()
        WHERE id = $2`,
      [req.ip || null, user.id],
    );

    await recordAudit(tenantId, "login_success", {
      portalUserId: user.id,
      username: user.username,
      req,
    });

    res.cookie(COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
      expires: refreshExpiresAt,
    });

    res.json({
      success: true,
      data: {
        accessToken,
        portalUser: {
          id: user.id,
          tenantId: user.tenant_id,
          clientId: user.client_id,
          contactId: user.contact_id,
          username: user.username,
          email: user.email,
          displayName: user.display_name,
          mustChangePassword: user.must_change_password,
        },
      },
    });
  }

  /**
   * GET /api/client-portal/auth/me
   * Returns the portal user identity + the client/company they belong to.
   */
  static async me(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const result = await pool.query(
      `SELECT u.id, u.tenant_id, u.client_id, u.contact_id, u.username, u.email,
              u.display_name, u.must_change_password, u.last_login_at,
              c.company_name, c.client_code, c.industry, c.website,
              ct.first_name, ct.last_name, ct.designation
         FROM client_portal_users u
         LEFT JOIN clients_v2 c          ON c.id = u.client_id
         LEFT JOIN client_contacts_v2 ct ON ct.id = u.contact_id
        WHERE u.id = $1 AND u.tenant_id = $2`,
      [ctx.portalUserId, ctx.tenantId],
    );
    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ success: false, error: "Portal user not found" });
      return;
    }

    res.json({
      success: true,
      data: {
        id: row.id,
        tenantId: row.tenant_id,
        clientId: row.client_id,
        contactId: row.contact_id,
        username: row.username,
        email: row.email,
        displayName:
          row.display_name ||
          [row.first_name, row.last_name].filter(Boolean).join(" ") ||
          row.username,
        designation: row.designation,
        mustChangePassword: row.must_change_password,
        lastLoginAt: row.last_login_at,
        client: row.client_id
          ? {
              id: row.client_id,
              companyName: row.company_name,
              clientCode: row.client_code,
              industry: row.industry,
              website: row.website,
            }
          : null,
      },
    });
  }

  /**
   * POST /api/client-portal/auth/logout
   * Revokes the current session row and clears the cookie.
   */
  static async logout(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    const refreshToken = req.cookies?.[COOKIE_NAME];

    if (ctx && refreshToken) {
      await pool.query(
        `UPDATE client_portal_sessions
            SET revoked_at = NOW()
          WHERE refresh_token = $1 AND portal_user_id = $2`,
        [refreshToken, ctx.portalUserId],
      );
    }

    res.clearCookie(COOKIE_NAME, { path: "/" });
    res.json({ success: true, message: "Logged out" });
  }

  /**
   * POST /api/client-portal/auth/change-password
   * Used when must_change_password is true (first login) or by the user
   * voluntarily. Requires current password.
   */
  static async changePassword(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        error: "Current and new password are required",
      });
      return;
    }
    if (String(newPassword).length < 10) {
      res.status(400).json({
        success: false,
        error: "Password must be at least 10 characters",
      });
      return;
    }

    const r = await pool.query(
      `SELECT password_hash FROM client_portal_users WHERE id = $1 AND tenant_id = $2`,
      [ctx.portalUserId, ctx.tenantId],
    );
    const hash = r.rows[0]?.password_hash;
    if (!hash) {
      res.status(404).json({ success: false, error: "Portal user not found" });
      return;
    }

    const ok = await bcrypt.compare(currentPassword, hash);
    if (!ok) {
      res.status(401).json({
        success: false,
        error: "Current password is incorrect",
      });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      `UPDATE client_portal_users
          SET password_hash = $1,
              must_change_password = FALSE,
              updated_at = NOW()
        WHERE id = $2`,
      [newHash, ctx.portalUserId],
    );

    await recordAudit(ctx.tenantId, "password_changed", {
      portalUserId: ctx.portalUserId,
      username: ctx.username,
      req,
    });

    res.json({ success: true, message: "Password updated" });
  }
}

export default ClientPortalAuthController;
