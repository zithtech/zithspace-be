import { JWTPayload, TokenPair, AuthUser } from "@/types";
export declare class JWTUtils {
    private static readonly ACCESS_TOKEN_SECRET;
    private static readonly REFRESH_TOKEN_SECRET;
    private static readonly ACCESS_TOKEN_EXPIRY;
    private static readonly REFRESH_TOKEN_EXPIRY;
    private static readonly ISSUER;
    /**
     * Generate access and refresh token pair
     */
    static generateTokenPair(user: AuthUser): TokenPair;
    /**
     * Verify access token
     */
    static verifyAccessToken(token: string, tenantId?: string): JWTPayload;
    /**
     * Verify refresh token
     */
    static verifyRefreshToken(token: string, tenantId?: string): JWTPayload;
    /**
     * Extract token from Authorization header
     */
    static extractTokenFromHeader(authHeader: string | undefined): string | null;
    /**
     * Generate a new access token from refresh token payload
     */
    static generateAccessTokenFromRefresh(refreshPayload: JWTPayload, user: AuthUser): string;
    /**
     * Check if token is expired without verifying signature
     */
    static isTokenExpired(token: string): boolean;
    /**
     * Get token expiration time
     */
    static getTokenExpiration(token: string): Date | null;
    /**
     * Get token claims without verification
     */
    static getTokenClaims(token: string): JWTPayload | null;
    /**
     * Generate session ID
     */
    private static generateSessionId;
    /**
     * Generate secure random token for various purposes
     */
    static generateSecureToken(length?: number): string;
    /**
     * Create a temporary token for email verification, password reset, etc.
     */
    static createTemporaryToken(payload: Record<string, any>, expiresIn?: any): string;
    /**
     * Verify temporary token
     */
    static verifyTemporaryToken(token: string): any;
    /**
     * Get time until token expires (in seconds)
     */
    static getTimeUntilExpiry(token: string): number | null;
    /**
     * Check if token will expire soon (within specified minutes)
     */
    static willExpireSoon(token: string, withinMinutes?: number): boolean;
    /**
     * Blacklist token (would need Redis implementation)
     */
    static blacklistToken(token: string): Promise<void>;
    /**
     * Check if token is blacklisted
     */
    static isTokenBlacklisted(token: string): Promise<boolean>;
}
export default JWTUtils;
