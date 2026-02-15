import jwt, { SignOptions, VerifyOptions } from "jsonwebtoken";
import { randomBytes } from "crypto";
import { JWTPayload, TokenPair, AuthUser } from "@/types";

export class JWTUtils {
  private static readonly ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET!;
  private static readonly REFRESH_TOKEN_SECRET =
    process.env.JWT_REFRESH_SECRET!;
  private static readonly ACCESS_TOKEN_EXPIRY: jwt.SignOptions["expiresIn"] =
    (process.env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"]) ||
    "1d";

  private static readonly REFRESH_TOKEN_EXPIRY: jwt.SignOptions["expiresIn"] =
    (process.env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"]) ||
    "30d";

  private static readonly ISSUER = "zithmi-backend-v2";

  /**
   * Generate access and refresh token pair
   */
  static generateTokenPair(user: AuthUser): TokenPair {
    const sessionId = this.generateSessionId();

    const accessPayload: Omit<JWTPayload, "iat" | "exp"> = {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      position: user.position,
      sessionId,
    };

    const refreshPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      sessionId,
    };

    const accessTokenOptions: SignOptions = {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
      issuer: this.ISSUER,
      audience: [user.tenantId],
      subject: user.id,
    };

    const refreshTokenOptions: SignOptions = {
      expiresIn: this.REFRESH_TOKEN_EXPIRY,
      issuer: this.ISSUER,
      audience: [user.tenantId],
      subject: user.id,
    };

    const accessToken = jwt.sign(
      accessPayload,
      this.ACCESS_TOKEN_SECRET,
      accessTokenOptions
    );

    const refreshToken = jwt.sign(
      refreshPayload,
      this.REFRESH_TOKEN_SECRET,
      refreshTokenOptions
    );

    return { accessToken, refreshToken };
  }

  /**
   * Verify access token
   */
  static verifyAccessToken(token: string, tenantId?: string): JWTPayload {
    try {
      const options: VerifyOptions = {
        issuer: this.ISSUER,
        ...(tenantId && { audience: tenantId }),
      };

      const decoded = jwt.verify(
        token,
        this.ACCESS_TOKEN_SECRET,
        options
      ) as JWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error("Access token expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error("Invalid access token");
      } else {
        throw new Error("Access token verification failed");
      }
    }
  }

  /**
   * Verify refresh token
   */
  static verifyRefreshToken(token: string, tenantId?: string): JWTPayload {
    try {
      const options: VerifyOptions = {
        issuer: this.ISSUER,
        ...(tenantId && { audience: tenantId }),
      };

      const decoded = jwt.verify(
        token,
        this.REFRESH_TOKEN_SECRET,
        options
      ) as JWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error("Refresh token expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error("Invalid refresh token");
      } else {
        throw new Error("Refresh token verification failed");
      }
    }
  }

  /**
   * Extract token from Authorization header
   */
  static extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) return null;

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") return null;

    return parts[1];
  }

  /**
   * Generate a new access token from refresh token payload
   */
  static generateAccessTokenFromRefresh(
    refreshPayload: JWTPayload,
    user: AuthUser
  ): string {
    const payload: Omit<JWTPayload, "iat" | "exp"> = {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      position: user.position,
      sessionId: refreshPayload.sessionId || this.generateSessionId(),
    };

    const options: SignOptions = {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
      issuer: this.ISSUER,
      audience: [user.tenantId],
      subject: user.id,
    };

    return jwt.sign(payload, this.ACCESS_TOKEN_SECRET, options);
  }

  /**
   * Check if token is expired without verifying signature
   */
  static isTokenExpired(token: string): boolean {
    try {
      const decoded = jwt.decode(token) as JWTPayload;
      if (!decoded || !decoded.exp) return true;

      const currentTime = Math.floor(Date.now() / 1000);
      return decoded.exp < currentTime;
    } catch (error) {
      return true;
    }
  }

  /**
   * Get token expiration time
   */
  static getTokenExpiration(token: string): Date | null {
    try {
      const decoded = jwt.decode(token) as JWTPayload;
      if (!decoded || !decoded.exp) return null;

      return new Date(decoded.exp * 1000);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get token claims without verification
   */
  static getTokenClaims(token: string): JWTPayload | null {
    try {
      return jwt.decode(token) as JWTPayload;
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate session ID
   */
  private static generateSessionId(): string {
    return randomBytes(32).toString("hex");
  }

  /**
   * Generate secure random token for various purposes
   */
  static generateSecureToken(length: number = 32): string {
    return randomBytes(length).toString("hex");
  }

  /**
   * Create a temporary token for email verification, password reset, etc.
   */
  static createTemporaryToken(
    payload: Record<string, any>,
    expiresIn: any = "1h"
  ): string {
    const options: SignOptions = {
      expiresIn,
      issuer: this.ISSUER,
    };

    return jwt.sign(payload, this.ACCESS_TOKEN_SECRET, options);
  }

  /**
   * Verify temporary token
   */
  static verifyTemporaryToken(token: string): any {
    try {
      return jwt.verify(token, this.ACCESS_TOKEN_SECRET, {
        issuer: this.ISSUER,
      });
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error("Token expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error("Invalid token");
      } else {
        throw new Error("Token verification failed");
      }
    }
  }

  /**
   * Get time until token expires (in seconds)
   */
  static getTimeUntilExpiry(token: string): number | null {
    try {
      const decoded = jwt.decode(token) as JWTPayload;
      if (!decoded || !decoded.exp) return null;

      const currentTime = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = decoded.exp - currentTime;

      return timeUntilExpiry > 0 ? timeUntilExpiry : 0;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if token will expire soon (within specified minutes)
   */
  static willExpireSoon(token: string, withinMinutes: number = 5): boolean {
    const timeUntilExpiry = this.getTimeUntilExpiry(token);
    if (timeUntilExpiry === null) return true;

    const withinSeconds = withinMinutes * 60;
    return timeUntilExpiry <= withinSeconds;
  }

  /**
   * Blacklist token (would need Redis implementation)
   */
  static async blacklistToken(token: string): Promise<void> {
    // TODO: Implement Redis blacklist
    // This would store the token JTI in Redis with expiry
    console.log("Token blacklisted:", token.substring(0, 20) + "...");
  }

  /**
   * Check if token is blacklisted
   */
  static async isTokenBlacklisted(token: string): Promise<boolean> {
    // TODO: Implement Redis blacklist check
    // This would check if token JTI exists in Redis blacklist
    return false;
  }
}

export default JWTUtils;
