import { Request, Response, NextFunction } from "express";
import pool from "@/config/dbpool";
import ClientPortalJWT, {
  ClientPortalJWTPayload,
} from "@/utils/clientPortalJwt";

export interface ClientPortalUserCtx {
  portalUserId: string;
  tenantId: string;
  clientId: string;
  contactId: string | null;
  username: string;
  email: string;
  sessionId: string;
}

// Augment Express Request with a portalUser field. Kept separate from the
// staff `req.user` so a route can require one identity or the other but never
// confuse them.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      portalUser?: ClientPortalUserCtx;
    }
  }
}

function unauthorized(res: Response, message: string, code: string): void {
  res.status(401).json({ success: false, error: message, code });
}

/**
 * Verifies a client-portal JWT, loads the portal user row, and attaches
 * `req.portalUser`. Staff JWTs cannot satisfy this — they sign with audience
 * `[tenantId]` only, no `portal:client`.
 */
export const authenticateClientPortal = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = ClientPortalJWT.extractTokenFromHeader(
      req.headers.authorization,
    );
    if (!token) {
      unauthorized(res, "Client portal token required", "PORTAL_TOKEN_REQUIRED");
      return;
    }

    let decoded: ClientPortalJWTPayload;
    try {
      decoded = ClientPortalJWT.verifyAccessToken(token);
    } catch (err: any) {
      unauthorized(
        res,
        err?.message || "Invalid client portal token",
        "PORTAL_TOKEN_INVALID",
      );
      return;
    }

    const userRow = await pool.query(
      `SELECT id, tenant_id, client_id, contact_id, username, email, status
         FROM client_portal_users
        WHERE id = $1 AND tenant_id = $2
        LIMIT 1`,
      [decoded.portalUserId, decoded.tenantId],
    );

    const user = userRow.rows[0];
    if (!user) {
      unauthorized(res, "Portal user not found", "PORTAL_USER_NOT_FOUND");
      return;
    }
    if (user.status !== "active") {
      unauthorized(res, "Portal user is not active", "PORTAL_USER_INACTIVE");
      return;
    }

    req.portalUser = {
      portalUserId: user.id,
      tenantId: user.tenant_id,
      clientId: user.client_id,
      contactId: user.contact_id,
      username: user.username,
      email: user.email,
      sessionId: decoded.sessionId,
    };

    next();
  } catch (err) {
    console.error("clientPortalAuth error:", err);
    unauthorized(res, "Authentication failed", "PORTAL_AUTH_FAILED");
  }
};
