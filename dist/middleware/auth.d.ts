import { Response, NextFunction } from 'express';
import { AuthRequest } from '@/types';
/**
 * Authentication middleware to verify JWT tokens
 */
export declare const authenticateToken: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
/**
 * Optional authentication middleware - doesn't fail if no token provided
 * OPTIMIZED: Use direct prisma client
 */
export declare const optionalAuth: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
/**
 * Middleware to ensure user is authenticated
 */
export declare const requireAuth: (req: AuthRequest, res: Response, next: NextFunction) => void;
/**
 * Middleware factory to check specific roles
 */
export declare const requireRole: (...allowedRoles: string[]) => (req: AuthRequest, res: Response, next: NextFunction) => void;
/**
 * Middleware to check if user is super_admin
 */
export declare const requireSuperAdmin: (req: AuthRequest, res: Response, next: NextFunction) => void;
/**
 * Middleware to check if user is admin or super_admin
 */
export declare const requireAdmin: (req: AuthRequest, res: Response, next: NextFunction) => void;
/**
 * Middleware to check if user owns the resource or has admin privileges
 */
export declare const requireOwnershipOrAdmin: (resourceUserIdField?: string) => (req: AuthRequest, res: Response, next: NextFunction) => void;
/**
 * Middleware to extract user info from token without strict validation
 * Useful for logging and analytics
 */
export declare const extractUserInfo: (req: AuthRequest, res: Response, next: NextFunction) => void;
/**
 * Rate limiting middleware for authentication endpoints
 */
export declare const authRateLimit: (maxAttempts?: number, windowMs?: number) => (req: AuthRequest, res: Response, next: NextFunction) => void;
/**
 * Middleware to validate session
 */
export declare const validateSession: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
declare const _default: {
    authenticateToken: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    optionalAuth: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    requireAuth: (req: AuthRequest, res: Response, next: NextFunction) => void;
    requireRole: (...allowedRoles: string[]) => (req: AuthRequest, res: Response, next: NextFunction) => void;
    requireSuperAdmin: (req: AuthRequest, res: Response, next: NextFunction) => void;
    requireAdmin: (req: AuthRequest, res: Response, next: NextFunction) => void;
    requireOwnershipOrAdmin: (resourceUserIdField?: string) => (req: AuthRequest, res: Response, next: NextFunction) => void;
    extractUserInfo: (req: AuthRequest, res: Response, next: NextFunction) => void;
    authRateLimit: (maxAttempts?: number, windowMs?: number) => (req: AuthRequest, res: Response, next: NextFunction) => void;
    validateSession: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
export default _default;
