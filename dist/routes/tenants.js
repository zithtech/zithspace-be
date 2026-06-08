"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const tenantController_1 = require("@/controllers/tenantController");
const tenantContext_1 = require("@/middleware/tenantContext");
const auth_1 = require("@/middleware/auth");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const router = (0, express_1.Router)();
// Rate limiting for tenant operations
const tenantRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 requests per window
    message: {
        success: false,
        error: 'Too many tenant requests, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
// Strict rate limiting for tenant registration (public endpoint)
const registrationRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Only 3 registration attempts per hour per IP
    message: {
        success: false,
        error: 'Too many registration attempts. Please try again later.',
        code: 'REGISTRATION_RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
// ==========================================
// PUBLIC ENDPOINTS (No authentication required)
// ==========================================
/**
 * POST /api/tenants/register
 * Register a new tenant with admin user
 * Public endpoint for tenant self-registration
 */
router.post('/register', registrationRateLimit, tenantController_1.TenantController.register);
/**
 * GET /api/tenants/resolve?subdomain=example
 * Resolve tenant by subdomain - returns tenant UUID
 * Public endpoint for frontend tenant detection
 */
router.get('/resolve', tenantRateLimit, tenantController_1.TenantController.resolve);
/**
 * GET /api/tenants/check-subdomain?subdomain=example
 * Check if subdomain is available for registration
 * Public endpoint for registration validation
 */
router.get('/check-subdomain', tenantRateLimit, tenantController_1.TenantController.checkSubdomainAvailability);
// ==========================================
// TENANT-AWARE ENDPOINTS (Require tenant context)
// ==========================================
/**
 * GET /api/tenants/profile
 * Get current tenant profile and statistics
 * Requires tenant context and authentication
 */
router.get('/profile', tenantRateLimit, tenantContext_1.resolveTenant, auth_1.authenticateToken, tenantController_1.TenantController.getProfile);
/**
 * PUT /api/tenants/profile
 * Update current tenant profile
 * Requires tenant context, authentication, and admin role
 */
router.put('/profile', tenantRateLimit, tenantContext_1.resolveTenant, auth_1.authenticateToken, (0, permission_1.requirePermission)(permissions_1.Permissions.SETTINGS_UPDATE), tenantController_1.TenantController.updateProfile);
router.put('/complete-setup', tenantRateLimit, tenantContext_1.resolveTenant, auth_1.authenticateToken, tenantController_1.TenantController.completeSetup);
/**
 * DELETE /api/tenants/logo-version
 * Delete a specific logo version
 */
router.delete('/logo-version', tenantRateLimit, tenantContext_1.resolveTenant, auth_1.authenticateToken, (0, permission_1.requirePermission)(permissions_1.Permissions.SETTINGS_UPDATE), tenantController_1.TenantController.deleteLogoVersion);
/**
 * GET /api/tenants/statistics
 * Get detailed tenant statistics
 * Requires tenant context, authentication, and admin role
 */
router.get('/statistics', tenantRateLimit, tenantContext_1.resolveTenant, auth_1.authenticateToken, (0, permission_1.requirePermission)(permissions_1.Permissions.REPORT_READ), tenantController_1.TenantController.getStatistics);
// ==========================================
// super_admin ENDPOINTS (Require super_admin access)
// ==========================================
/**
 * POST /api/tenants/:tenantId/deactivate
 * Deactivate a tenant (suspend account)
 * Requires super_admin access
 */
router.post('/:tenantId/deactivate', tenantRateLimit, auth_1.authenticateToken, auth_1.requireSuperAdmin, tenantController_1.TenantController.deactivate);
/**
 * POST /api/tenants/:tenantId/activate
 * Activate a tenant (restore account)
 * Requires super_admin access
 */
router.post('/:tenantId/activate', tenantRateLimit, auth_1.authenticateToken, auth_1.requireSuperAdmin, tenantController_1.TenantController.activate);
exports.default = router;
//# sourceMappingURL=tenants.js.map