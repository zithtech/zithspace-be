"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTenantAccess = exports.checkTenantLimits = exports.requireTenant = exports.optionalTenantContext = exports.resolveTenant = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
const cacheService_1 = __importDefault(require("@/utils/cacheService"));
/**
 * Middleware to resolve tenant context from various sources
 */
const resolveTenant = async (req, res, next) => {
    try {
        let tenantIdentifier;
        tenantIdentifier = req.headers["x-tenant-id"];
        if (!tenantIdentifier) {
            tenantIdentifier = req.headers["x-tenant-subdomain"];
        }
        if (!tenantIdentifier) {
            const host = req.get("Host");
            if (host && !host.includes("localhost")) {
                const subdomain = host.split(".")[0];
                if (subdomain &&
                    subdomain !== "www" &&
                    subdomain !== "api" &&
                    !subdomain.includes("backend") &&
                    !subdomain.includes("be-v") &&
                    !subdomain.startsWith("z-tickets")) {
                    tenantIdentifier = subdomain;
                }
            }
        }
        if (!tenantIdentifier && req.user) {
            tenantIdentifier = req.user.tenantId;
        }
        // Strategy 5: From query parameter (development only)
        if (!tenantIdentifier && process.env.NODE_ENV === "development") {
            tenantIdentifier = req.query.tenant;
        }
        if (!tenantIdentifier) {
            const error = new types_1.TenantError("Tenant identifier is required");
            throw error;
        }
        const tenant = await findTenant(tenantIdentifier);
        if (!tenant) {
            const error = new types_1.NotFoundError("Tenant");
            throw error;
        }
        if (!tenant.isActive) {
            const error = new types_1.TenantError("Tenant is not active");
            throw error;
        }
        // Attach tenant info to request
        req.tenantId = tenant.id;
        req.tenant = tenant;
        await database_1.tenantAwarePrisma.setTenantContext(tenant.id);
        next();
    }
    catch (error) {
        if (error instanceof types_1.TenantError || error instanceof types_1.NotFoundError) {
            res.status(error.statusCode).json({
                success: false,
                error: error.message,
                code: error.code,
            });
            return;
        }
        res.status(500).json({
            success: false,
            error: "Tenant resolution failed",
            code: "TENANT_RESOLUTION_ERROR",
        });
    }
};
exports.resolveTenant = resolveTenant;
/**
 * Find tenant by subdomain or ID (with caching)
 */
async function findTenant(identifier) {
    // Try cache first
    let tenant = await cacheService_1.default.getTenantBySubdomain(identifier);
    if (!tenant) {
        tenant = await cacheService_1.default.getTenant(identifier);
    }
    if (!tenant) {
        // Cache miss - fetch from database
        const rawClient = database_1.tenantAwarePrisma.getRawClient();
        tenant = await rawClient.tenant.findFirst({
            where: {
                OR: [{ subdomain: identifier }, { id: identifier }],
            },
        });
        // Cache for 10 minutes
        if (tenant) {
            await cacheService_1.default.cacheTenant(tenant.id, tenant);
            if (tenant.subdomain) {
                await cacheService_1.default.cacheTenantBySubdomain(tenant.subdomain, tenant);
            }
        }
    }
    return tenant;
}
/**
 * Optional tenant resolution - doesn't fail if tenant not found
 * Useful for endpoints that work both with and without tenant context
 */
const optionalTenantContext = async (req, res, next) => {
    try {
        let tenantIdentifier;
        // Strategy 1: From X-Tenant-ID header (prioritize for cross-domain architecture)
        tenantIdentifier = req.headers["x-tenant-id"];
        // Strategy 2: From X-Tenant-Subdomain header
        if (!tenantIdentifier) {
            tenantIdentifier = req.headers["x-tenant-subdomain"];
        }
        // Strategy 3: From subdomain (only for same-domain deployments)
        if (!tenantIdentifier) {
            const host = req.get("Host");
            if (host && !host.includes("localhost")) {
                const subdomain = host.split(".")[0];
                // Skip subdomain extraction for backend service domains
                if (subdomain &&
                    subdomain !== "www" &&
                    subdomain !== "api" &&
                    !subdomain.includes("backend") &&
                    !subdomain.includes("be-v") &&
                    !subdomain.startsWith("z-tickets")) {
                    tenantIdentifier = subdomain;
                }
            }
        }
        // Strategy 4: From JWT token (if user is already authenticated)
        if (!tenantIdentifier && req.user) {
            tenantIdentifier = req.user.tenantId;
        }
        // Strategy 5: From query parameter (development only)
        if (!tenantIdentifier && process.env.NODE_ENV === "development") {
            tenantIdentifier = req.query.tenant;
        }
        if (tenantIdentifier) {
            const rawClient = database_1.tenantAwarePrisma.getRawClient();
            const tenant = await rawClient.tenant.findFirst({
                where: {
                    OR: [
                        { subdomain: tenantIdentifier.toLowerCase() },
                        { id: tenantIdentifier },
                    ],
                    isActive: true,
                },
                select: {
                    id: true,
                    name: true,
                    subdomain: true,
                    planType: true,
                    maxUsers: true,
                    isActive: true,
                    settings: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
            if (tenant && tenant.isActive) {
                req.tenantId = tenant.id;
                req.tenant = tenant;
                // OPTIMIZED: Set tenant context ONCE here
                await database_1.tenantAwarePrisma.setTenantContext(tenant.id);
            }
        }
        next();
    }
    catch (error) {
        next();
    }
};
exports.optionalTenantContext = optionalTenantContext;
/**
 * Middleware to ensure tenant context is required
 * Use after optionalTenantContext to enforce tenant requirement
 */
const requireTenant = (req, res, next) => {
    if (!req.tenantId || !req.tenant) {
        res.status(400).json({
            success: false,
            error: "Tenant context is required",
            code: "TENANT_REQUIRED",
        });
        return;
    }
    next();
};
exports.requireTenant = requireTenant;
/**
 * Middleware to check tenant plan limits
 */
const checkTenantLimits = (limitType) => {
    return async (req, res, next) => {
        try {
            if (!req.tenant) {
                throw new types_1.TenantError("Tenant context required");
            }
            const tenant = req.tenant;
            switch (limitType) {
                case "users":
                    if (req.method === "POST" && req.path.includes("/users")) {
                        const currentUserCount = await database_1.tenantAwarePrisma.withTenant(tenant.id, async (client) => {
                            return await client.user.count({
                                where: {
                                    tenantId: tenant.id,
                                    isActive: true,
                                },
                            });
                        });
                        if (currentUserCount >= tenant.maxUsers) {
                            res.status(403).json({
                                success: false,
                                error: `User limit reached. Maximum ${tenant.maxUsers} users allowed for ${tenant.planType} plan.`,
                                code: "TENANT_LIMIT_EXCEEDED",
                            });
                            return;
                        }
                    }
                    break;
                case "projects":
                    // Add project limits based on plan type
                    if (req.method === "POST" && req.path.includes("/projects")) {
                        const maxProjects = getMaxProjectsForPlan(tenant.planType);
                        const currentProjectCount = await database_1.tenantAwarePrisma.withTenant(tenant.id, async (client) => {
                            return await client.project.count({
                                where: {
                                    tenantId: tenant.id,
                                },
                            });
                        });
                        if (currentProjectCount >= maxProjects) {
                            res.status(403).json({
                                success: false,
                                error: `Project limit reached. Maximum ${maxProjects} projects allowed for ${tenant.planType} plan.`,
                                code: "TENANT_LIMIT_EXCEEDED",
                            });
                            return;
                        }
                    }
                    break;
                case "storage":
                    // Implement storage limits if needed
                    break;
            }
            next();
        }
        catch (error) {
            console.error("Tenant limit check error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to check tenant limits",
                code: "TENANT_LIMIT_CHECK_ERROR",
            });
        }
    };
};
exports.checkTenantLimits = checkTenantLimits;
/**
 * Get maximum projects allowed for a plan type
 */
function getMaxProjectsForPlan(planType) {
    switch (planType) {
        case "basic":
            return 3;
        case "pro":
            return 10;
        case "enterprise":
            return 100;
        default:
            return 3;
    }
}
/**
 * Middleware to validate tenant access for cross-tenant operations
 */
const validateTenantAccess = (req, res, next) => {
    // Ensure user belongs to the tenant context
    if (req.user && req.tenantId && req.user.tenantId !== req.tenantId) {
        res.status(403).json({
            success: false,
            error: "Access denied: Invalid tenant context",
            code: "INVALID_TENANT_ACCESS",
        });
        return;
    }
    next();
};
exports.validateTenantAccess = validateTenantAccess;
exports.default = {
    resolveTenant: exports.resolveTenant,
    optionalTenantContext: exports.optionalTenantContext,
    requireTenant: exports.requireTenant,
    checkTenantLimits: exports.checkTenantLimits,
    validateTenantAccess: exports.validateTenantAccess,
};
//# sourceMappingURL=tenantContext.js.map