"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSession = exports.authRateLimit = exports.extractUserInfo = exports.requireOwnershipOrAdmin = exports.requireAdmin = exports.requireSuperAdmin = exports.requireRole = exports.requireAuth = exports.optionalAuth = exports.authenticateToken = void 0;
const jwt_1 = require("@/utils/jwt");
const database_1 = require("@/config/database");
const cacheService_1 = __importDefault(require("@/utils/cacheService"));
const types_1 = require("@/types");
/**
 * Authentication middleware to verify JWT tokens
 */
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = jwt_1.JWTUtils.extractTokenFromHeader(authHeader);
        if (!token) {
            const error = new types_1.AuthenticationError('Access token required');
            throw error;
        }
        const isBlacklisted = await jwt_1.JWTUtils.isTokenBlacklisted(token);
        if (isBlacklisted) {
            const error = new types_1.AuthenticationError('Token has been revoked');
            throw error;
        }
        const decoded = jwt_1.JWTUtils.verifyAccessToken(token, req.tenantId);
        let user = await cacheService_1.default.getUser(decoded.userId, decoded.tenantId);
        if (!user) {
            user = await database_1.prisma.user.findFirst({
                where: {
                    id: decoded.userId,
                    tenantId: decoded.tenantId,
                    isActive: true,
                },
                include: {
                    position: {
                        select: {
                            id: true,
                            title: true,
                            code: true,
                        },
                    },
                },
            });
            // Cache for 5 minutes
            if (user) {
                await cacheService_1.default.cacheUser(decoded.userId, decoded.tenantId, user);
            }
        }
        if (!user) {
            const error = new types_1.AuthenticationError('User not found or inactive');
            throw error;
        }
        if (!req.tenant || !req.tenant.isActive) {
            const error = new types_1.AuthenticationError('Tenant not found');
            throw error;
        }
        if (req.tenantId && user.tenantId !== req.tenantId) {
            const error = new types_1.AuthorizationError('Invalid tenant context');
            throw error;
        }
        req.user = {
            id: user.id,
            tenantId: user.tenantId,
            email: user.workEmail,
            role: user.role,
            position: user.position?.title || null,
            name: user.name,
            employeeId: user.employeeId, // Added this field
            sessionId: decoded.sessionId,
        };
        // Phase 7B: Validate Subscription Status before proceeding
        const { validateSubscriptionStatus } = await Promise.resolve().then(() => __importStar(require('../modules/subscriptions/subscription.middleware')));
        let subscriptionValid = false;
        await new Promise((resolve, reject) => {
            validateSubscriptionStatus(req, res, ((err) => {
                if (err)
                    reject(err);
                else {
                    subscriptionValid = true;
                    resolve();
                }
            }));
        });
        if (subscriptionValid) {
            next();
        }
    }
    catch (error) {
        if (error instanceof types_1.AuthenticationError || error instanceof types_1.AuthorizationError) {
            res.status(error.statusCode).json({
                success: false,
                error: error.message,
                code: error.code,
            });
            return;
        }
        res.status(401).json({
            success: false,
            error: 'Authentication failed',
            code: 'AUTHENTICATION_FAILED',
        });
    }
};
exports.authenticateToken = authenticateToken;
/**
 * Optional authentication middleware - doesn't fail if no token provided
 * OPTIMIZED: Use direct prisma client
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = jwt_1.JWTUtils.extractTokenFromHeader(authHeader);
        if (!token) {
            // No token provided, continue without authentication
            next();
            return;
        }
        // Try to verify the token
        const decoded = jwt_1.JWTUtils.verifyAccessToken(token, req.tenantId);
        // OPTIMIZED: Use direct prisma client (context already set)
        const user = await database_1.prisma.user.findFirst({
            where: {
                id: decoded.userId,
                tenantId: decoded.tenantId,
                isActive: true,
            },
            include: {
                position: {
                    select: {
                        id: true,
                        title: true,
                        code: true,
                    },
                },
            },
        });
        if (user && (!req.tenantId || user.tenantId === req.tenantId)) {
            req.user = {
                id: user.id,
                tenantId: user.tenantId,
                email: user.workEmail,
                role: user.role,
                position: user.position?.title || null,
                name: user.name,
                sessionId: decoded.sessionId,
            };
        }
        next();
    }
    catch (error) {
        // Token verification failed, but continue without authentication
        next();
    }
};
exports.optionalAuth = optionalAuth;
/**
 * Middleware to ensure user is authenticated
 */
const requireAuth = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({
            success: false,
            error: 'Authentication required',
            code: 'AUTHENTICATION_REQUIRED',
        });
        return;
    }
    next();
};
exports.requireAuth = requireAuth;
/**
 * Middleware factory to check specific roles
 */
const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({
                success: false,
                error: 'Authentication required',
                code: 'AUTHENTICATION_REQUIRED',
            });
            return;
        }
        if (!allowedRoles.includes(req.user.role)) {
            res.status(403).json({
                success: false,
                error: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
                code: 'INSUFFICIENT_PERMISSIONS',
            });
            return;
        }
        next();
    };
};
exports.requireRole = requireRole;
/**
 * Middleware to check if user is super_admin
 */
exports.requireSuperAdmin = (0, exports.requireRole)('super_admin');
/**
 * Middleware to check if user is admin or super_admin
 */
exports.requireAdmin = (0, exports.requireRole)('super_admin', 'admin');
/**
 * Middleware to check if user owns the resource or has admin privileges
 */
const requireOwnershipOrAdmin = (resourceUserIdField = 'userId') => {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({
                success: false,
                error: 'Authentication required',
                code: 'AUTHENTICATION_REQUIRED',
            });
            return;
        }
        // super_admins and admins can access any resource
        if (req.user.role === 'super_admin' || req.user.role === 'admin') {
            next();
            return;
        }
        // Check ownership
        const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];
        if (resourceUserId && resourceUserId === req.user.id) {
            next();
            return;
        }
        res.status(403).json({
            success: false,
            error: 'Access denied: You can only access your own resources',
            code: 'RESOURCE_ACCESS_DENIED',
        });
    };
};
exports.requireOwnershipOrAdmin = requireOwnershipOrAdmin;
/**
 * Middleware to extract user info from token without strict validation
 * Useful for logging and analytics
 */
const extractUserInfo = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = jwt_1.JWTUtils.extractTokenFromHeader(authHeader);
        if (token && !jwt_1.JWTUtils.isTokenExpired(token)) {
            const claims = jwt_1.JWTUtils.getTokenClaims(token);
            if (claims) {
                req.user = {
                    id: claims.userId,
                    tenantId: claims.tenantId,
                    email: claims.email,
                    role: claims.role,
                    position: claims.position,
                    name: '', // Not available in token claims
                    sessionId: claims.sessionId,
                };
            }
        }
    }
    catch (error) {
        // Silently fail - this is just for info extraction
    }
    next();
};
exports.extractUserInfo = extractUserInfo;
/**
 * Rate limiting middleware for authentication endpoints
 */
const authRateLimit = (maxAttempts = 5, windowMs = 15 * 60 * 1000 // 15 minutes
) => {
    // TODO: Implement Redis-based rate limiting
    // For now, return a placeholder middleware
    return (req, res, next) => {
        // This would check Redis for rate limit data
        // and block requests if limit exceeded
        next();
    };
};
exports.authRateLimit = authRateLimit;
/**
 * Middleware to validate session
 */
const validateSession = async (req, res, next) => {
    try {
        if (!req.user || !req.user.sessionId) {
            next();
            return;
        }
        // TODO: Implement Redis session validation
        // Check if session exists and is valid
        const isValidSession = true; // Placeholder
        if (!isValidSession) {
            res.status(401).json({
                success: false,
                error: 'Invalid session',
                code: 'INVALID_SESSION',
            });
            return;
        }
        next();
    }
    catch (error) {
        console.error('Session validation error:', error);
        next();
    }
};
exports.validateSession = validateSession;
exports.default = {
    authenticateToken: exports.authenticateToken,
    optionalAuth: exports.optionalAuth,
    requireAuth: exports.requireAuth,
    requireRole: exports.requireRole,
    requireSuperAdmin: exports.requireSuperAdmin,
    requireAdmin: exports.requireAdmin,
    requireOwnershipOrAdmin: exports.requireOwnershipOrAdmin,
    extractUserInfo: exports.extractUserInfo,
    authRateLimit: exports.authRateLimit,
    validateSession: exports.validateSession,
};
//# sourceMappingURL=auth.js.map