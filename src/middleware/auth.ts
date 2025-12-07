import { Response, NextFunction } from 'express';
import { JWTUtils } from '@/utils/jwt';
import { prisma } from '@/config/database';
import TenantLogger from '@/utils/tenantLogger';
import { 
  AuthRequest, 
  AuthenticationError, 
  AuthorizationError
} from '@/types';

/**
 * Authentication middleware to verify JWT tokens
 */
export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // const timer = TenantLogger.startTimer();
  
  try {
    // TenantLogger.logMiddlewareEntry('authenticateToken', req);
    
    const authHeader = req.headers.authorization;
    const token = JWTUtils.extractTokenFromHeader(authHeader);

    if (!token) {
      const error = new AuthenticationError('Access token required');
      // TenantLogger.logAuthTenantValidation(req, false, 'No token provided');
      throw error;
    }

    // TenantLogger.debug('Token extracted from header', {
    //   operation: 'AUTHENTICATION',
    //   step: 'TOKEN_EXTRACTED',
    //   metadata: { hasToken: !!token, tokenLength: token?.length }
    // });

    // Check if token is blacklisted (TODO: implement Redis)
    const isBlacklisted = await JWTUtils.isTokenBlacklisted(token);
    if (isBlacklisted) {
      const error = new AuthenticationError('Token has been revoked');
      // TenantLogger.logAuthTenantValidation(req, false, 'Token blacklisted');
      throw error;
    }

    // Verify the token
    // TenantLogger.debug('Verifying JWT token', {
    //   operation: 'AUTHENTICATION',
    //   step: 'TOKEN_VERIFICATION',
    //   tenantId: req.tenantId,
    //   metadata: { requestTenantId: req.tenantId }
    // });

    const decoded = JWTUtils.verifyAccessToken(token, req.tenantId);

    // TenantLogger.info('JWT token verified successfully', {
    //   operation: 'AUTHENTICATION',
    //   step: 'TOKEN_VERIFIED',
    //   tenantId: decoded.tenantId,
    //   userId: decoded.userId,
    //   metadata: { 
    //     tokenTenantId: decoded.tenantId,
    //     requestTenantId: req.tenantId,
    //     userId: decoded.userId
    //   }
    // });

    // OPTIMIZED: Get fresh user data - tenant context already set by middleware
    // No need for withTenant wrapper or tenant include
    const user = await prisma.user.findFirst({
      where: {
        id: decoded.userId,
        tenantId: decoded.tenantId,
        isActive: true,
      },
    });

    if (!user) {
      const error = new AuthenticationError('User not found or inactive');
      // TenantLogger.logAuthTenantValidation(req, false, 'User not found or inactive');
      throw error;
    }

    // Use req.tenant (already fetched by tenantContext middleware)
    if (!req.tenant || !req.tenant.isActive) {
      const error = new AuthenticationError('Tenant is not active');
      // TenantLogger.logAuthTenantValidation(req, false, 'Tenant is not active');
      throw error;
    }

    // Ensure user belongs to the current tenant context
    if (req.tenantId && user.tenantId !== req.tenantId) {
      const error = new AuthorizationError('Invalid tenant context');
      // TenantLogger.logAuthTenantValidation(req, false, 'Tenant context mismatch');
      throw error;
    }

    // TenantLogger.logAuthTenantValidation(req, true, 'Authentication successful');

    // Attach user info to request
    req.user = {
      id: user.id,
      tenantId: user.tenantId,
      email: user.workEmail,
      role: user.role as any,
      position: user.position as any,
      name: user.name,
      sessionId: decoded.sessionId,
    };

    // OPTIMIZED: Remove lastLoginAt update to avoid write on every request
    // This was causing significant performance overhead
    // Consider updating only on actual login, or use background job

    // TenantLogger.logMiddlewareExit('authenticateToken', req, true);
    // timer.end('authenticateToken', { tenantId: user.tenantId, userId: user.id });
    next();
  } catch (error) {
    // TenantLogger.logTenantError(error, req, 'AUTHENTICATION');
    // TenantLogger.logMiddlewareExit('authenticateToken', req, false);
    // timer.end('authenticateToken_failed');
    
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
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

/**
 * Optional authentication middleware - doesn't fail if no token provided
 * OPTIMIZED: Use direct prisma client
 */
export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = JWTUtils.extractTokenFromHeader(authHeader);

    if (!token) {
      // No token provided, continue without authentication
      next();
      return;
    }

    // Try to verify the token
    const decoded = JWTUtils.verifyAccessToken(token, req.tenantId);
    
    // OPTIMIZED: Use direct prisma client (context already set)
    const user = await prisma.user.findFirst({
      where: {
        id: decoded.userId,
        tenantId: decoded.tenantId,
        isActive: true,
      },
    });

    if (user && (!req.tenantId || user.tenantId === req.tenantId)) {
      req.user = {
        id: user.id,
        tenantId: user.tenantId,
        email: user.workEmail,
        role: user.role as any,
        position: user.position as any,
        name: user.name,
        sessionId: decoded.sessionId,
      };
    }

    next();
  } catch (error) {
    // Token verification failed, but continue without authentication
    next();
  }
};

/**
 * Middleware to ensure user is authenticated
 */
export const requireAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
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

/**
 * Middleware factory to check specific roles
 */
export const requireRole = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
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

/**
 * Middleware to check if user is super_admin
 */
export const requireSuperAdmin = requireRole('super_admin');

/**
 * Middleware to check if user is admin or super_admin
 */
export const requireAdmin = requireRole('super_admin', 'admin');

/**
 * Middleware to check if user owns the resource or has admin privileges
 */
export const requireOwnershipOrAdmin = (resourceUserIdField: string = 'userId') => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
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

/**
 * Middleware to extract user info from token without strict validation
 * Useful for logging and analytics
 */
export const extractUserInfo = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    const token = JWTUtils.extractTokenFromHeader(authHeader);

    if (token && !JWTUtils.isTokenExpired(token)) {
      const claims = JWTUtils.getTokenClaims(token);
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
  } catch (error) {
    // Silently fail - this is just for info extraction
  }

  next();
};

/**
 * Rate limiting middleware for authentication endpoints
 */
export const authRateLimit = (
  maxAttempts: number = 5,
  windowMs: number = 15 * 60 * 1000 // 15 minutes
) => {
  // TODO: Implement Redis-based rate limiting
  // For now, return a placeholder middleware
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    // This would check Redis for rate limit data
    // and block requests if limit exceeded
    next();
  };
};

/**
 * Middleware to validate session
 */
export const validateSession = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
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
  } catch (error) {
    console.error('Session validation error:', error);
    next();
  }
};

export default {
  authenticateToken,
  optionalAuth,
  requireAuth,
  requireRole,
  requireSuperAdmin,
  requireAdmin,
  requireOwnershipOrAdmin,
  extractUserInfo,
  authRateLimit,
  validateSession,
};
