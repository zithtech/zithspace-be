import { Response, NextFunction } from "express";
import { AuthRequest } from "@/types";
/**
 * Middleware to resolve tenant context from various sources
 */
export declare const resolveTenant: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
/**
 * Optional tenant resolution - doesn't fail if tenant not found
 * Useful for endpoints that work both with and without tenant context
 */
export declare const optionalTenantContext: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
/**
 * Middleware to ensure tenant context is required
 * Use after optionalTenantContext to enforce tenant requirement
 */
export declare const requireTenant: (req: AuthRequest, res: Response, next: NextFunction) => void;
/**
 * Middleware to check tenant plan limits
 */
export declare const checkTenantLimits: (limitType: "users" | "projects" | "storage") => (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
/**
 * Middleware to validate tenant access for cross-tenant operations
 */
export declare const validateTenantAccess: (req: AuthRequest, res: Response, next: NextFunction) => void;
declare const _default: {
    resolveTenant: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    optionalTenantContext: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    requireTenant: (req: AuthRequest, res: Response, next: NextFunction) => void;
    checkTenantLimits: (limitType: "users" | "projects" | "storage") => (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    validateTenantAccess: (req: AuthRequest, res: Response, next: NextFunction) => void;
};
export default _default;
