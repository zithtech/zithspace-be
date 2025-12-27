"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWTUtils = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = require("crypto");
class JWTUtils {
    /**
     * Generate access and refresh token pair
     */
    static generateTokenPair(user) {
        const sessionId = this.generateSessionId();
        const accessPayload = {
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
        const accessTokenOptions = {
            expiresIn: this.ACCESS_TOKEN_EXPIRY,
            issuer: this.ISSUER,
            audience: [user.tenantId],
            subject: user.id,
        };
        const refreshTokenOptions = {
            expiresIn: this.REFRESH_TOKEN_EXPIRY,
            issuer: this.ISSUER,
            audience: [user.tenantId],
            subject: user.id,
        };
        const accessToken = jsonwebtoken_1.default.sign(accessPayload, this.ACCESS_TOKEN_SECRET, accessTokenOptions);
        const refreshToken = jsonwebtoken_1.default.sign(refreshPayload, this.REFRESH_TOKEN_SECRET, refreshTokenOptions);
        return { accessToken, refreshToken };
    }
    /**
     * Verify access token
     */
    static verifyAccessToken(token, tenantId) {
        try {
            const options = {
                issuer: this.ISSUER,
                ...(tenantId && { audience: tenantId }),
            };
            const decoded = jsonwebtoken_1.default.verify(token, this.ACCESS_TOKEN_SECRET, options);
            return decoded;
        }
        catch (error) {
            if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
                throw new Error("Access token expired");
            }
            else if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
                throw new Error("Invalid access token");
            }
            else {
                throw new Error("Access token verification failed");
            }
        }
    }
    /**
     * Verify refresh token
     */
    static verifyRefreshToken(token, tenantId) {
        try {
            const options = {
                issuer: this.ISSUER,
                ...(tenantId && { audience: tenantId }),
            };
            const decoded = jsonwebtoken_1.default.verify(token, this.REFRESH_TOKEN_SECRET, options);
            return decoded;
        }
        catch (error) {
            if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
                throw new Error("Refresh token expired");
            }
            else if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
                throw new Error("Invalid refresh token");
            }
            else {
                throw new Error("Refresh token verification failed");
            }
        }
    }
    /**
     * Extract token from Authorization header
     */
    static extractTokenFromHeader(authHeader) {
        if (!authHeader)
            return null;
        const parts = authHeader.split(" ");
        if (parts.length !== 2 || parts[0] !== "Bearer")
            return null;
        return parts[1];
    }
    /**
     * Generate a new access token from refresh token payload
     */
    static generateAccessTokenFromRefresh(refreshPayload, user) {
        const payload = {
            userId: user.id,
            tenantId: user.tenantId,
            email: user.email,
            role: user.role,
            position: user.position,
            sessionId: refreshPayload.sessionId || this.generateSessionId(),
        };
        const options = {
            expiresIn: this.ACCESS_TOKEN_EXPIRY,
            issuer: this.ISSUER,
            audience: [user.tenantId],
            subject: user.id,
        };
        return jsonwebtoken_1.default.sign(payload, this.ACCESS_TOKEN_SECRET, options);
    }
    /**
     * Check if token is expired without verifying signature
     */
    static isTokenExpired(token) {
        try {
            const decoded = jsonwebtoken_1.default.decode(token);
            if (!decoded || !decoded.exp)
                return true;
            const currentTime = Math.floor(Date.now() / 1000);
            return decoded.exp < currentTime;
        }
        catch (error) {
            return true;
        }
    }
    /**
     * Get token expiration time
     */
    static getTokenExpiration(token) {
        try {
            const decoded = jsonwebtoken_1.default.decode(token);
            if (!decoded || !decoded.exp)
                return null;
            return new Date(decoded.exp * 1000);
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Get token claims without verification
     */
    static getTokenClaims(token) {
        try {
            return jsonwebtoken_1.default.decode(token);
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Generate session ID
     */
    static generateSessionId() {
        return (0, crypto_1.randomBytes)(32).toString("hex");
    }
    /**
     * Generate secure random token for various purposes
     */
    static generateSecureToken(length = 32) {
        return (0, crypto_1.randomBytes)(length).toString("hex");
    }
    /**
     * Create a temporary token for email verification, password reset, etc.
     */
    static createTemporaryToken(payload, expiresIn = "1h") {
        const options = {
            expiresIn,
            issuer: this.ISSUER,
        };
        return jsonwebtoken_1.default.sign(payload, this.ACCESS_TOKEN_SECRET, options);
    }
    /**
     * Verify temporary token
     */
    static verifyTemporaryToken(token) {
        try {
            return jsonwebtoken_1.default.verify(token, this.ACCESS_TOKEN_SECRET, {
                issuer: this.ISSUER,
            });
        }
        catch (error) {
            if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
                throw new Error("Token expired");
            }
            else if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
                throw new Error("Invalid token");
            }
            else {
                throw new Error("Token verification failed");
            }
        }
    }
    /**
     * Get time until token expires (in seconds)
     */
    static getTimeUntilExpiry(token) {
        try {
            const decoded = jsonwebtoken_1.default.decode(token);
            if (!decoded || !decoded.exp)
                return null;
            const currentTime = Math.floor(Date.now() / 1000);
            const timeUntilExpiry = decoded.exp - currentTime;
            return timeUntilExpiry > 0 ? timeUntilExpiry : 0;
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Check if token will expire soon (within specified minutes)
     */
    static willExpireSoon(token, withinMinutes = 5) {
        const timeUntilExpiry = this.getTimeUntilExpiry(token);
        if (timeUntilExpiry === null)
            return true;
        const withinSeconds = withinMinutes * 60;
        return timeUntilExpiry <= withinSeconds;
    }
    /**
     * Blacklist token (would need Redis implementation)
     */
    static async blacklistToken(token) {
        // TODO: Implement Redis blacklist
        // This would store the token JTI in Redis with expiry
        console.log("Token blacklisted:", token.substring(0, 20) + "...");
    }
    /**
     * Check if token is blacklisted
     */
    static async isTokenBlacklisted(token) {
        // TODO: Implement Redis blacklist check
        // This would check if token JTI exists in Redis blacklist
        return false;
    }
}
exports.JWTUtils = JWTUtils;
JWTUtils.ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET;
JWTUtils.REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET;
JWTUtils.ACCESS_TOKEN_EXPIRY = process.env.JWT_ACCESS_EXPIRES_IN ||
    "15m";
JWTUtils.REFRESH_TOKEN_EXPIRY = process.env.JWT_REFRESH_EXPIRES_IN ||
    "30d";
JWTUtils.ISSUER = "zithmi-backend-v2";
exports.default = JWTUtils;
//# sourceMappingURL=jwt.js.map