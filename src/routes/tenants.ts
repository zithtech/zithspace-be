import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { TenantController } from '@/controllers/tenantController';
import { resolveTenant, optionalTenantContext } from '@/middleware/tenantContext';
import { authenticateToken, requireSuperAdmin } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';

const router = Router();

// Rate limiting for tenant operations
const tenantRateLimit = rateLimit({
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
const registrationRateLimit = rateLimit({
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
router.post('/register', registrationRateLimit, TenantController.register);

/**
 * GET /api/tenants/resolve?subdomain=example
 * Resolve tenant by subdomain - returns tenant UUID
 * Public endpoint for frontend tenant detection
 */
router.get('/resolve', tenantRateLimit, TenantController.resolve);

/**
 * GET /api/tenants/check-subdomain?subdomain=example
 * Check if subdomain is available for registration
 * Public endpoint for registration validation
 */
router.get('/check-subdomain', tenantRateLimit, TenantController.checkSubdomainAvailability);

// ==========================================
// TENANT-AWARE ENDPOINTS (Require tenant context)
// ==========================================

/**
 * GET /api/tenants/profile
 * Get current tenant profile and statistics
 * Requires tenant context and authentication
 */
router.get('/profile', tenantRateLimit, resolveTenant, authenticateToken, TenantController.getProfile);

/**
 * PUT /api/tenants/profile
 * Update current tenant profile
 * Requires tenant context, authentication, and admin role
 */
router.put('/profile', tenantRateLimit, resolveTenant, authenticateToken, requirePermission(Permissions.SETTINGS_UPDATE), TenantController.updateProfile);

router.put('/complete-setup', tenantRateLimit, resolveTenant, authenticateToken, TenantController.completeSetup);

/**
 * DELETE /api/tenants/logo-version
 * Delete a specific logo version
 */
router.delete('/logo-version', tenantRateLimit, resolveTenant, authenticateToken, requirePermission(Permissions.SETTINGS_UPDATE), TenantController.deleteLogoVersion);

/**
 * GET /api/tenants/statistics
 * Get detailed tenant statistics
 * Requires tenant context, authentication, and admin role
 */
router.get('/statistics', tenantRateLimit, resolveTenant, authenticateToken, requirePermission(Permissions.REPORT_READ), TenantController.getStatistics);

/**
 * GET /api/tenants/extension-install-key
 * Get the current Chrome Extension install key for the active tenant.
 * Requires tenant context, authentication, and settings-update permission (admin).
 */
router.get('/extension-install-key', tenantRateLimit, resolveTenant, authenticateToken, requirePermission(Permissions.SETTINGS_UPDATE), TenantController.getExtensionInstallKey);

/**
 * POST /api/tenants/extension-install-key/generate
 * Generate or rotate the Chrome Extension install key for the active tenant.
 * Requires tenant context, authentication, and settings-update permission (admin).
 */
router.post('/extension-install-key/generate', tenantRateLimit, resolveTenant, authenticateToken, requirePermission(Permissions.SETTINGS_UPDATE), TenantController.generateExtensionInstallKey);

// ==========================================
// super_admin ENDPOINTS (Require super_admin access)
// ==========================================

/**
 * POST /api/tenants/:tenantId/deactivate
 * Deactivate a tenant (suspend account)
 * Requires super_admin access
 */
router.post('/:tenantId/deactivate', tenantRateLimit, resolveTenant, authenticateToken, requireSuperAdmin, TenantController.deactivate);

/**
 * POST /api/tenants/:tenantId/activate
 * Activate a tenant (restore account)
 * Requires super_admin access
 */
router.post('/:tenantId/activate', tenantRateLimit, resolveTenant, authenticateToken, requireSuperAdmin, TenantController.activate);

/**
 * GET /api/tenants
 * Get all tenants with their web inquiry secret keys
 * Requires super_admin access
 */
router.get('/', tenantRateLimit, resolveTenant, authenticateToken, requireSuperAdmin, TenantController.getAllTenants);

/**
 * POST /api/tenants/generate-missing-secrets
 * Generate missing secret keys for all tenants
 * Requires super_admin access
 */
router.post('/generate-missing-secrets', tenantRateLimit, resolveTenant, authenticateToken, requireSuperAdmin, TenantController.generateMissingSecretKeys);

/**
 * POST /api/tenants/:tenantId/generate-secret
 * Generate secret key for a specific tenant
 * Requires super_admin access
 */
router.post('/:tenantId/generate-secret', tenantRateLimit, resolveTenant, authenticateToken, requireSuperAdmin, TenantController.generateSecretKey);

export default router;
