"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSession = exports.authRateLimit = exports.extractUserInfo = exports.requireOwnershipOrAdmin = exports.requireAdmin = exports.requireSuperAdmin = exports.requireRole = exports.requireAuth = exports.optionalAuth = exports.authenticateToken = void 0;
const jwt_1 = require("@/utils/jwt");
const database_1 = require("@/config/database");
const tenantLogger_1 = __importDefault(require("@/utils/tenantLogger"));
const types_1 = require("@/types");
/**
 * Authentication middleware to verify JWT tokens
 */
const authenticateToken = async (req, res, next) => {
    const timer = tenantLogger_1.default.startTimer();
    try {
        tenantLogger_1.default.logMiddlewareEntry('authenticateToken', req);
        const authHeader = req.headers.authorization;
        const token = jwt_1.JWTUtils.extractTokenFromHeader(authHeader);
        if (!token) {
            const error = new types_1.AuthenticationError('Access token required');
            tenantLogger_1.default.logAuthTenantValidation(req, false, 'No token provided');
            throw error;
        }
        tenantLogger_1.default.debug('Token extracted from header', {
            operation: 'AUTHENTICATION',
            step: 'TOKEN_EXTRACTED',
            metadata: { hasToken: !!token, tokenLength: token?.length }
        });
        // Check if token is blacklisted (TODO: implement Redis)
        const isBlacklisted = await jwt_1.JWTUtils.isTokenBlacklisted(token);
        if (isBlacklisted) {
            const error = new types_1.AuthenticationError('Token has been revoked');
            tenantLogger_1.default.logAuthTenantValidation(req, false, 'Token blacklisted');
            throw error;
        }
        // Verify the token
        tenantLogger_1.default.debug('Verifying JWT token', {
            operation: 'AUTHENTICATION',
            step: 'TOKEN_VERIFICATION',
            tenantId: req.tenantId,
            metadata: { requestTenantId: req.tenantId }
        });
        const decoded = jwt_1.JWTUtils.verifyAccessToken(token, req.tenantId);
        tenantLogger_1.default.info('JWT token verified successfully', {
            operation: 'AUTHENTICATION',
            step: 'TOKEN_VERIFIED',
            tenantId: decoded.tenantId,
            userId: decoded.userId,
            metadata: {
                tokenTenantId: decoded.tenantId,
                requestTenantId: req.tenantId,
                userId: decoded.userId
            }
        });
        // Get fresh user data to ensure user is still active and belongs to tenant
        tenantLogger_1.default.debug('Fetching user data from database', {
            operation: 'AUTHENTICATION',
            step: 'USER_LOOKUP',
            tenantId: decoded.tenantId,
            userId: decoded.userId,
            metadata: { userId: decoded.userId, tenantId: decoded.tenantId }
        });
        const user = await database_1.tenantAwarePrisma.withTenant(decoded.tenantId, async (client) => {
            return await client.user.findFirst({
                where: {
                    id: decoded.userId,
                    tenantId: decoded.tenantId,
                    isActive: true,
                },
                include: {
                    tenant: true,
                },
            });
        });
        if (!user) {
            const error = new types_1.AuthenticationError('User not found or inactive');
            tenantLogger_1.default.logAuthTenantValidation(req, false, 'User not found or inactive');
            throw error;
        }
        if (!user.tenant.isActive) {
            const error = new types_1.AuthenticationError('Tenant is not active');
            tenantLogger_1.default.logAuthTenantValidation(req, false, 'Tenant is not active');
            throw error;
        }
        // Ensure user belongs to the current tenant context
        if (req.tenantId && user.tenantId !== req.tenantId) {
            const error = new types_1.AuthorizationError('Invalid tenant context');
            tenantLogger_1.default.logAuthTenantValidation(req, false, 'Tenant context mismatch');
            throw error;
        }
        tenantLogger_1.default.logAuthTenantValidation(req, true, 'Authentication successful');
        // Attach user info to request
        req.user = {
            id: user.id,
            tenantId: user.tenantId,
            email: user.workEmail,
            role: user.role,
            position: user.position,
            name: user.name,
            sessionId: decoded.sessionId,
        };
        tenantLogger_1.default.info('User authenticated successfully', {
            operation: 'AUTHENTICATION',
            step: 'AUTH_SUCCESS',
            tenantId: user.tenantId,
            userId: user.id,
            metadata: {
                userId: user.id,
                tenantId: user.tenantId,
                role: user.role,
                email: user.workEmail
            }
        });
        // Update last login time
        tenantLogger_1.default.debug('Updating user last login time', {
            operation: 'AUTHENTICATION',
            step: 'UPDATE_LOGIN_TIME',
            tenantId: user.tenantId,
            userId: user.id,
            metadata: { userId: user.id }
        });
        await database_1.tenantAwarePrisma.withTenant(user.tenantId, async (client) => {
            await client.user.update({
                where: { id: user.id },
                data: { lastLoginAt: new Date() },
            });
        });
        tenantLogger_1.default.logMiddlewareExit('authenticateToken', req, true);
        timer.end('authenticateToken', { tenantId: user.tenantId, userId: user.id });
        next();
    }
    catch (error) {
        tenantLogger_1.default.logTenantError(error, req, 'AUTHENTICATION');
        tenantLogger_1.default.logMiddlewareExit('authenticateToken', req, false);
        timer.end('authenticateToken_failed');
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
        const user = await database_1.tenantAwarePrisma.withTenant(decoded.tenantId, async (client) => {
            return await client.user.findFirst({
                where: {
                    id: decoded.userId,
                    tenantId: decoded.tenantId,
                    isActive: true,
                },
            });
        });
        if (user && (!req.tenantId || user.tenantId === req.tenantId)) {
            req.user = {
                id: user.id,
                tenantId: user.tenantId,
                email: user.workEmail,
                role: user.role,
                position: user.position,
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