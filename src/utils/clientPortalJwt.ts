import jwt, { SignOptions, VerifyOptions } from "jsonwebtoken";
import { randomBytes } from "crypto";

// Distinct audience tag so client-portal tokens cannot be replayed against
// staff-facing endpoints (and vice versa). Staff JWTs use `audience: [tenantId]`;
// portal JWTs use `audience: ["portal:client", tenantId]`.
export const CLIENT_PORTAL_AUDIENCE = "portal:client";

export interface ClientPortalJWTPayload {
  portalUserId: string;
  tenantId: string;
  clientId: string;
  contactId: string | null;
  username: string;
  email: string;
  sessionId: string;
  scope: "client_portal";
  iat?: number;
  exp?: number;
  aud?: string | string[];
}

export interface ClientPortalAuthIdentity {
  portalUserId: string;
  tenantId: string;
  clientId: string;
  contactId: string | null;
  username: string;
  email: string;
}

export interface ClientPortalTokenPair {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  refreshExpiresAt: Date;
}

export class ClientPortalJWT {
  private static readonly ACCESS_SECRET =
    process.env.CLIENT_PORTAL_JWT_ACCESS_SECRET ||
    process.env.JWT_ACCESS_SECRET!;
  private static readonly REFRESH_SECRET =
    process.env.CLIENT_PORTAL_JWT_REFRESH_SECRET ||
    process.env.JWT_REFRESH_SECRET!;
  private static readonly ACCESS_EXPIRY: SignOptions["expiresIn"] =
    (process.env.CLIENT_PORTAL_ACCESS_EXPIRES_IN as SignOptions["expiresIn"]) ||
    "30m";
  private static readonly REFRESH_EXPIRY_DAYS = parseInt(
    process.env.CLIENT_PORTAL_REFRESH_EXPIRES_IN_DAYS || "14",
    10,
  );
  private static readonly ISSUER = "zithmi-client-portal";

  static generateTokenPair(
    identity: ClientPortalAuthIdentity,
  ): ClientPortalTokenPair {
    const sessionId = randomBytes(32).toString("hex");

    const accessPayload: Omit<ClientPortalJWTPayload, "iat" | "exp" | "aud"> = {
      portalUserId: identity.portalUserId,
      tenantId: identity.tenantId,
      clientId: identity.clientId,
      contactId: identity.contactId,
      username: identity.username,
      email: identity.email,
      sessionId,
      scope: "client_portal",
    };

    const accessOptions: SignOptions = {
      expiresIn: this.ACCESS_EXPIRY,
      issuer: this.ISSUER,
      audience: [CLIENT_PORTAL_AUDIENCE, identity.tenantId],
      subject: identity.portalUserId,
    };

    const accessToken = jwt.sign(
      accessPayload,
      this.ACCESS_SECRET,
      accessOptions,
    );

    const refreshExpiresAt = new Date(
      Date.now() + this.REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );
    const refreshToken = randomBytes(48).toString("hex");

    return { accessToken, refreshToken, sessionId, refreshExpiresAt };
  }

  static verifyAccessToken(
    token: string,
    tenantId?: string,
  ): ClientPortalJWTPayload {
    const options: VerifyOptions = {
      issuer: this.ISSUER,
      audience: tenantId
        ? [CLIENT_PORTAL_AUDIENCE, tenantId]
        : CLIENT_PORTAL_AUDIENCE,
    };

    try {
      const decoded = jwt.verify(
        token,
        this.ACCESS_SECRET,
        options,
      ) as ClientPortalJWTPayload;

      if (decoded.scope !== "client_portal") {
        throw new Error("Invalid token scope");
      }
      return decoded;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new Error("Client portal access token expired");
      }
      if (err instanceof jwt.JsonWebTokenError) {
        throw new Error("Invalid client portal access token");
      }
      throw err;
    }
  }

  static extractTokenFromHeader(
    authHeader: string | undefined,
  ): string | null {
    if (!authHeader) return null;
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") return null;
    return parts[1];
  }
}

export default ClientPortalJWT;
