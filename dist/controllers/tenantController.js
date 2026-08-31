"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const tenantLogger_1 = __importDefault(require("@/utils/tenantLogger"));
const dbpool_1 = __importDefault(require("@/config/dbpool"));
const rbac_service_1 = require("@/modules/rbac/rbac.service");
const entitlements_service_1 = require("@/modules/entitlements/entitlements.service");
const brand_1 = require("@/config/brand");
const types_1 = require("@/types");
const r2Client_1 = require("@/utils/r2Client");
const transactionHistory_1 = require("@/utils/transactionHistory");
class TenantController {
    /**
     * Register a new tenant with admin user (public endpoint)
     */
    static async register(req, res) {
        const timer = tenantLogger_1.default.startTimer();
        try {
            tenantLogger_1.default.logControllerOperation(req, 'tenant', 'register', {
                requestData: {
                    name: req.body.name,
                    subdomain: req.body.subdomain,
                    planType: req.body.planType,
                    hasAdminUser: !!req.body.adminUser
                }
            });
            const tenantData = req.body;
            // Validate required fields
            if (!tenantData.name || !tenantData.subdomain || !tenantData.adminUser) {
                tenantLogger_1.default.warn('Tenant registration validation failed', {
                    operation: 'TENANT_REGISTRATION',
                    step: 'VALIDATION_ERROR',
                    metadata: {
                        hasName: !!tenantData.name,
                        hasSubdomain: !!tenantData.subdomain,
                        hasAdminUser: !!tenantData.adminUser
                    }
                });
                res.status(400).json({
                    success: false,
                    error: "Tenant name, subdomain, and admin user information are required",
                });
                return;
            }
            tenantLogger_1.default.info('Starting tenant registration process', {
                operation: 'TENANT_REGISTRATION',
                step: 'VALIDATION_SUCCESS',
                metadata: {
                    subdomain: tenantData.subdomain,
                    planType: tenantData.planType || 'basic',
                    adminEmail: tenantData.adminUser.email
                }
            });
            // Check if subdomain is already taken
            tenantLogger_1.default.debug('Checking subdomain availability', {
                operation: 'TENANT_REGISTRATION',
                step: 'SUBDOMAIN_CHECK',
                metadata: { subdomain: tenantData.subdomain }
            });
            const existingTenantResult = await dbpool_1.default.query('SELECT id FROM tenants WHERE subdomain = $1 LIMIT 1', [tenantData.subdomain.toLowerCase()]);
            if (existingTenantResult.rows.length > 0) {
                tenantLogger_1.default.warn('Subdomain already exists', {
                    operation: 'TENANT_REGISTRATION',
                    step: 'SUBDOMAIN_CONFLICT',
                    metadata: {
                        subdomain: tenantData.subdomain,
                        existingTenantId: existingTenantResult.rows[0].id
                    }
                });
                res.status(409).json({
                    success: false,
                    error: "Subdomain is already taken",
                });
                return;
            }
            // Validate subdomain format
            const subdomainRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
            if (!subdomainRegex.test(tenantData.subdomain) ||
                tenantData.subdomain.length < 3) {
                tenantLogger_1.default.warn('Invalid subdomain format', {
                    operation: 'TENANT_REGISTRATION',
                    step: 'SUBDOMAIN_FORMAT_ERROR',
                    metadata: {
                        subdomain: tenantData.subdomain,
                        length: tenantData.subdomain.length
                    }
                });
                res.status(400).json({
                    success: false,
                    error: "Invalid subdomain format. Must be lowercase, alphanumeric with hyphens, minimum 3 characters",
                });
                return;
            }
            // Hash admin password
            tenantLogger_1.default.debug('Hashing admin password', {
                operation: 'TENANT_REGISTRATION',
                step: 'PASSWORD_HASH',
                metadata: { adminEmail: tenantData.adminUser.email }
            });
            const passwordHash = await bcryptjs_1.default.hash(tenantData.adminUser.password, 12);
            // Create tenant and admin user in transaction
            tenantLogger_1.default.info('Creating tenant and admin user', {
                operation: 'TENANT_REGISTRATION',
                step: 'DATABASE_TRANSACTION_START',
                metadata: {
                    subdomain: tenantData.subdomain,
                    adminEmail: tenantData.adminUser.email
                }
            });
            const client = await dbpool_1.default.connect();
            let result;
            try {
                await client.query('BEGIN');
                const crypto = require('crypto');
                const tenantId = crypto.randomUUID();
                const secretKey = `${crypto.randomInt(10000, 100000)}/secretkey/${tenantData.subdomain.toLowerCase()}`;
                const tenantInsertResult = await client.query(`
          INSERT INTO tenants (id, name, subdomain, plan_type, max_users, settings, web_inquiry_secret_key)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, name, subdomain, plan_type
        `, [
                    tenantId,
                    tenantData.name,
                    tenantData.subdomain.toLowerCase(),
                    tenantData.planType || 'basic',
                    tenantData.maxUsers || 10,
                    tenantData.settings || {},
                    secretKey
                ]);
                const tenant = tenantInsertResult.rows[0];
                tenantLogger_1.default.info('Tenant created successfully', {
                    operation: 'TENANT_REGISTRATION',
                    step: 'TENANT_CREATED',
                    tenantId: tenant.id,
                    metadata: {
                        tenantId: tenant.id,
                        subdomain: tenant.subdomain,
                        planType: tenant.plan_type
                    }
                });
                const userId = crypto.randomUUID();
                const userInsertResult = await client.query(`
          INSERT INTO users (id, tenant_id, name, work_email, personal_email, phone, password_hash, role, work_days)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id, name, work_email
        `, [
                    userId,
                    tenant.id,
                    tenantData.adminUser.name,
                    tenantData.adminUser.email.toLowerCase(),
                    tenantData.adminUser.email.toLowerCase(),
                    tenantData.adminUser.phone,
                    passwordHash,
                    'super_admin',
                    [1, 2, 3, 4, 5]
                ]);
                const adminUser = userInsertResult.rows[0];
                tenantLogger_1.default.info('Admin user created successfully', {
                    operation: 'TENANT_REGISTRATION',
                    step: 'ADMIN_USER_CREATED',
                    tenantId: tenant.id,
                    userId: adminUser.id,
                    metadata: {
                        tenantId: tenant.id,
                        userId: adminUser.id,
                        adminEmail: adminUser.work_email
                    }
                });
                await client.query('COMMIT');
                // Setup default roles for the new tenant
                await rbac_service_1.RBACService.setupDefaultRolesForTenant(tenant.id);
                result = { tenant, adminUser };
            }
            catch (err) {
                await client.query('ROLLBACK');
                throw err;
            }
            finally {
                client.release();
            }
            tenantLogger_1.default.info('Tenant registration completed successfully', {
                operation: 'TENANT_REGISTRATION',
                step: 'REGISTRATION_SUCCESS',
                tenantId: result.tenant.id,
                userId: result.adminUser.id,
                metadata: {
                    tenantId: result.tenant.id,
                    subdomain: result.tenant.subdomain,
                    adminUserId: result.adminUser.id
                }
            });
            timer.end('tenant_registration', {
                tenantId: result.tenant.id,
                metadata: { subdomain: result.tenant.subdomain }
            });
            res.status(201).json({
                success: true,
                data: {
                    tenant: {
                        id: result.tenant.id,
                        name: result.tenant.name,
                        subdomain: result.tenant.subdomain,
                        isNewSetup: true,
                        planType: result.tenant.plan_type,
                    },
                    adminUser: {
                        id: result.adminUser.id,
                        name: result.adminUser.name,
                        email: result.adminUser.work_email,
                    },
                },
                message: "Tenant registered successfully",
            });
        }
        catch (error) {
            tenantLogger_1.default.logTenantError(error, req, 'TENANT_REGISTRATION');
            timer.end('tenant_registration_failed');
            if (error.code === "23505") { // Postgres unique violation error code
                res.status(409).json({
                    success: false,
                    error: "Subdomain or email already exists",
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to register tenant",
            });
        }
    }
    /**
     * Resolve tenant by subdomain (public endpoint for frontend)
     */
    static async resolve(req, res) {
        try {
            const { subdomain } = req.query;
            if (!subdomain || typeof subdomain !== "string") {
                res.status(400).json({
                    success: false,
                    error: "Subdomain parameter is required",
                });
                return;
            }
            const result = await dbpool_1.default.query(`SELECT id, name, subdomain, plan_type, is_active, is_setup_complete
         FROM tenants
         WHERE subdomain = $1 AND is_active = true
         LIMIT 1`, [subdomain.toLowerCase()]);
            const tenant = result.rows[0];
            // Scope the answer to the brand being asked through.
            //
            // This endpoint is unauthenticated and returns a real company name, so
            // without this check it is an existence oracle across BOTH products:
            // anyone could hit bigcorp.testiez.com and learn that BigCorp is a Zukvo
            // customer, plus their registered name. Two brands sharing one tenant
            // table makes that a competitive leak, not just an information one.
            //
            // The 404 below is deliberately identical to the not-found case — the
            // caller must not be able to tell "no such tenant" from "exists on the
            // other product".
            let entitled = true;
            const product = (0, brand_1.productFromRequest)(req);
            if (tenant && product) {
                try {
                    entitled = await (0, entitlements_service_1.hasProduct)(tenant.id, product);
                }
                catch (err) {
                    // Entitlements table may not exist yet (deployed ahead of the
                    // migration). Honour the same kill switch the middleware uses rather
                    // than making every workspace unresolvable.
                    console.error("[tenants/resolve] entitlement check failed:", err);
                    entitled = !entitlements_service_1.ENFORCING;
                }
            }
            if (!tenant || !entitled) {
                res.status(404).json({
                    success: false,
                    error: "Tenant not found",
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: {
                    tenantId: tenant.id,
                    tenantInfo: {
                        name: tenant.name,
                        subdomain: tenant.subdomain,
                        planType: tenant.plan_type,
                        isActive: tenant.is_active,
                        isSetupComplete: tenant.is_setup_complete,
                    },
                },
            });
        }
        catch (error) {
            console.error("Tenant resolution error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to resolve tenant",
            });
        }
    }
    static async completeSetup(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context required" });
                return;
            }
            if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
                res.status(403).json({ success: false, error: "Admin access required" });
                return;
            }
            const { workspaceName } = req.body;
            if (!workspaceName?.trim() || workspaceName.trim().length < 2) {
                res.status(400).json({ success: false, error: "Workspace name must be at least 2 characters" });
                return;
            }
            const newSubdomain = workspaceName
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9\s-]/g, "")
                .replace(/\s+/g, "-")
                .replace(/-+/g, "-")
                .replace(/^-|-$/g, "");
            if (newSubdomain.length < 2) {
                res.status(400).json({ success: false, error: "Workspace name produces an invalid subdomain" });
                return;
            }
            // Check uniqueness — allow the current tenant to keep its own subdomain
            const conflict = await dbpool_1.default.query("SELECT id FROM tenants WHERE subdomain = $1 AND id != $2 LIMIT 1", [newSubdomain, req.tenantId]);
            if (conflict.rows.length > 0) {
                res.status(409).json({ success: false, error: "This workspace name is already taken. Please choose another." });
                return;
            }
            const updated = await dbpool_1.default.query(`UPDATE tenants
         SET name = $1, subdomain = $2, is_setup_complete = true, updated_at = now()
         WHERE id = $3
         RETURNING id, name, subdomain`, [workspaceName.trim(), newSubdomain, req.tenantId]);
            res.status(200).json({
                success: true,
                data: {
                    name: updated.rows[0].name,
                    subdomain: updated.rows[0].subdomain,
                },
            });
        }
        catch (error) {
            console.error("Complete setup error:", error);
            res.status(500).json({ success: false, error: "Something went wrong. Please try again." });
        }
    }
    /**
     * Get current tenant profile (tenant-aware)
     */
    static async getProfile(req, res) {
        try {
            if (!req.tenantId || !req.tenant) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context is required",
                });
                return;
            }
            const tenantResult = await dbpool_1.default.query(`
        SELECT t.*,
          (SELECT COUNT(*)::int FROM users u WHERE u.tenant_id = t.id AND u.is_active = true) as active_users,
          (SELECT COUNT(*)::int FROM projects p WHERE p.tenant_id = t.id) as total_projects
        FROM tenants t
        WHERE t.id = $1
      `, [req.tenantId]);
            if (tenantResult.rows.length === 0) {
                throw new types_1.NotFoundError("Tenant not found");
            }
            const tenant = tenantResult.rows[0];
            res.status(200).json({
                success: true,
                data: {
                    id: tenant.id,
                    name: tenant.name,
                    subdomain: tenant.subdomain,
                    planType: tenant.plan_type,
                    maxUsers: tenant.max_users,
                    isActive: tenant.is_active,
                    settings: tenant.settings,
                    stats: {
                        activeUsers: tenant.active_users,
                        totalProjects: tenant.total_projects,
                    },
                    createdAt: tenant.created_at,
                    updatedAt: tenant.updated_at,
                },
            });
        }
        catch (error) {
            console.error("Get tenant profile error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get tenant profile",
            });
        }
    }
    /**
     * Update tenant profile (admin only)
     */
    static async updateProfile(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            // Check if user is admin
            if (req.user.role !== "admin" && req.user.role !== "super_admin") {
                res.status(403).json({
                    success: false,
                    error: "admin access required",
                });
                return;
            }
            const updateData = { ...req.body };
            // Handle logo uploads (original, cropped, or setting final)
            const currentTenantResult = await dbpool_1.default.query('SELECT name, settings FROM tenants WHERE id = $1', [req.tenantId]);
            const currentTenant = currentTenantResult.rows[0];
            const currentSettings = currentTenant?.settings || {};
            const logoVersions = Array.isArray(currentSettings.logoVersions) ? [...currentSettings.logoVersions] : [];
            let newLogoUrl = currentSettings.logoUrl;
            // 1. Handle Original Logo Upload
            if (updateData.logo && typeof updateData.logo === 'string' && updateData.logo.startsWith('data:image')) {
                try {
                    const logoUrl = await (0, r2Client_1.uploadImageToR2)(updateData.logo, req.tenantId);
                    newLogoUrl = logoUrl;
                    if (!logoVersions.includes(logoUrl)) {
                        logoVersions.push(logoUrl);
                    }
                    delete updateData.logo;
                }
                catch (uploadError) {
                    console.error("Original logo upload failed:", uploadError);
                    res.status(500).json({ success: false, error: "Failed to upload company logo" });
                    return;
                }
            }
            // 2. Handle Cropped Logo Upload
            if (updateData.croppedLogo && typeof updateData.croppedLogo === 'string' && updateData.croppedLogo.startsWith('data:image')) {
                try {
                    const croppedUrl = await (0, r2Client_1.uploadImageToR2)(updateData.croppedLogo, req.tenantId);
                    newLogoUrl = croppedUrl;
                    if (!logoVersions.includes(croppedUrl)) {
                        logoVersions.push(croppedUrl);
                    }
                    delete updateData.croppedLogo;
                }
                catch (uploadError) {
                    console.error("Cropped logo upload failed:", uploadError);
                    res.status(500).json({ success: false, error: "Failed to upload cropped logo" });
                    return;
                }
            }
            // 3. Handle Setting Final Logo from existing versions
            if (updateData.finalLogoUrl && typeof updateData.finalLogoUrl === 'string') {
                newLogoUrl = updateData.finalLogoUrl;
                delete updateData.finalLogoUrl;
            }
            // Update settings with new logo state
            updateData.settings = {
                ...currentSettings,
                logoUrl: newLogoUrl,
                logoVersions: logoVersions
            };
            // Remove sensitive fields that shouldn't be updated directly
            delete updateData.id;
            delete updateData.subdomain; // Subdomain changes require special handling
            delete updateData.createdAt;
            delete updateData.updatedAt;
            const setClauses = [];
            const values = [];
            let paramIdx = 1;
            for (const [key, value] of Object.entries(updateData)) {
                const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                setClauses.push(`${dbKey} = $${paramIdx}`);
                values.push(value);
                paramIdx++;
            }
            setClauses.push(`updated_at = NOW()`);
            values.push(req.tenantId);
            const tenantIdIdx = paramIdx;
            let updatedTenant;
            if (setClauses.length > 1) { // more than just updated_at
                const updatedTenantResult = await dbpool_1.default.query(`UPDATE tenants SET ${setClauses.join(', ')} WHERE id = $${tenantIdIdx} RETURNING *`, values);
                updatedTenant = updatedTenantResult.rows[0];
            }
            else {
                const updatedTenantResult = await dbpool_1.default.query(`SELECT * FROM tenants WHERE id = $1`, [req.tenantId]);
                updatedTenant = updatedTenantResult.rows[0];
            }
            // Log General Settings transaction if changed
            const beforeSnap = {
                name: currentTenant?.name,
                settings: currentSettings,
            };
            const afterSnap = {
                name: updatedTenant.name,
                settings: updatedTenant.settings,
            };
            const { changedFields, before, after } = (0, transactionHistory_1.diffShallow)(beforeSnap, afterSnap);
            if (changedFields.length > 0) {
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.ADMIN,
                    module: transactionHistory_1.Module.GENERAL_SETTINGS,
                    page: transactionHistory_1.Page.GENERAL_SETTINGS_VIEW,
                    action: transactionHistory_1.Action.UPDATE,
                    actionLabel: `Tenant settings updated (${changedFields.join(', ')})`,
                    entityType: transactionHistory_1.EntityType.TENANT_SETTINGS,
                    entityId: req.tenantId,
                    entityLabel: 'System Settings',
                    beforeData: before,
                    afterData: after,
                    changedFields,
                    statusCode: 200
                });
            }
            res.status(200).json({
                success: true,
                data: {
                    id: updatedTenant.id,
                    name: updatedTenant.name,
                    subdomain: updatedTenant.subdomain,
                    planType: updatedTenant.plan_type,
                    maxUsers: updatedTenant.max_users,
                    isActive: updatedTenant.is_active,
                    settings: updatedTenant.settings,
                },
                message: "Tenant profile updated successfully",
            });
        }
        catch (error) {
            console.error("Update tenant profile error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to update tenant profile",
            });
        }
    }
    static async deleteLogoVersion(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context required" });
                return;
            }
            const { url } = req.body;
            if (!url) {
                res.status(400).json({ success: false, error: "Logo URL is required" });
                return;
            }
            const tenantResult = await dbpool_1.default.query('SELECT settings FROM tenants WHERE id = $1', [req.tenantId]);
            const tenant = tenantResult.rows[0];
            if (!tenant) {
                res.status(404).json({ success: false, error: "Tenant not found" });
                return;
            }
            const settings = tenant.settings || {};
            let logoVersions = Array.isArray(settings.logoVersions) ? [...settings.logoVersions] : [];
            let currentLogoUrl = settings.logoUrl;
            // Filter out the URL
            logoVersions = logoVersions.filter(v => v !== url);
            // If deleted logo was the final one, switch to the next available or null
            if (currentLogoUrl === url) {
                currentLogoUrl = logoVersions.length > 0 ? logoVersions[0] : null;
            }
            // Update tenant settings
            await dbpool_1.default.query('UPDATE tenants SET settings = $1, updated_at = NOW() WHERE id = $2', [{
                    ...settings,
                    logoUrl: currentLogoUrl,
                    logoVersions: logoVersions
                }, req.tenantId]);
            res.status(200).json({
                success: true,
                message: "Logo version deleted successfully",
                data: { logoUrl: currentLogoUrl, logoVersions: logoVersions }
            });
        }
        catch (error) {
            console.error("Delete logo version error:", error);
            res.status(500).json({ success: false, error: "Failed to delete logo version" });
        }
    }
    /**
     * Get tenant statistics (admin only)
     */
    static async getStatistics(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const statsResult = await dbpool_1.default.query(`
        SELECT 
          (SELECT COUNT(*)::int FROM users WHERE tenant_id = $1) as total_users,
          (SELECT COUNT(*)::int FROM users WHERE tenant_id = $1 AND is_active = true) as active_users,
          (SELECT COUNT(*)::int FROM projects WHERE tenant_id = $1) as total_projects,
          (SELECT COUNT(*)::int FROM projects WHERE tenant_id = $1 AND status = 'active') as active_projects,
          (SELECT COUNT(*)::int FROM tickets WHERE tenant_id = $1) as total_tickets,
          (SELECT COUNT(*)::int FROM tickets WHERE tenant_id = $1 AND status = 'open') as open_tickets
      `, [req.tenantId]);
            const statsRow = statsResult.rows[0];
            const stats = {
                users: { total: statsRow.total_users, active: statsRow.active_users },
                projects: { total: statsRow.total_projects, active: statsRow.active_projects },
                tickets: { total: statsRow.total_tickets, open: statsRow.open_tickets },
            };
            res.status(200).json({
                success: true,
                data: stats,
            });
        }
        catch (error) {
            console.error("Get tenant statistics error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get tenant statistics",
            });
        }
    }
    /**
     * Check subdomain availability (public endpoint)
     */
    static async checkSubdomainAvailability(req, res) {
        try {
            const { subdomain } = req.query;
            if (!subdomain || typeof subdomain !== "string") {
                res.status(400).json({
                    success: false,
                    error: "Subdomain parameter is required",
                });
                return;
            }
            // Validate subdomain format
            const subdomainRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
            if (!subdomainRegex.test(subdomain) || subdomain.length < 3) {
                res.status(400).json({
                    success: false,
                    error: "Invalid subdomain format",
                    data: { available: false, reason: "Invalid format" },
                });
                return;
            }
            // Check reserved subdomains
            const reservedSubdomains = [
                "www",
                "api",
                "admin",
                "app",
                "mail",
                "ftp",
                "cdn",
            ];
            if (reservedSubdomains.includes(subdomain.toLowerCase())) {
                res.status(400).json({
                    success: false,
                    error: "Subdomain is reserved",
                    data: { available: false, reason: "Reserved subdomain" },
                });
                return;
            }
            const existingTenantResult = await dbpool_1.default.query('SELECT 1 FROM tenants WHERE subdomain = $1 LIMIT 1', [subdomain.toLowerCase()]);
            res.status(200).json({
                success: true,
                data: {
                    available: existingTenantResult.rows.length === 0,
                    subdomain: subdomain.toLowerCase(),
                },
            });
        }
        catch (error) {
            console.error("Check subdomain availability error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to check subdomain availability",
            });
        }
    }
    /**
     * Deactivate tenant (super_admin only)
     */
    static async deactivate(req, res) {
        try {
            if (!req.user || req.user.role !== "super_admin") {
                res.status(403).json({
                    success: false,
                    error: "super_admin access required",
                });
                return;
            }
            const { tenantId } = req.params;
            if (!tenantId) {
                res.status(400).json({
                    success: false,
                    error: "Tenant ID is required",
                });
                return;
            }
            const updatedTenantResult = await dbpool_1.default.query('UPDATE tenants SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id, name, subdomain, is_active', [tenantId]);
            const updatedTenant = updatedTenantResult.rows[0];
            res.status(200).json({
                success: true,
                data: {
                    id: updatedTenant.id,
                    name: updatedTenant.name,
                    subdomain: updatedTenant.subdomain,
                    isActive: updatedTenant.is_active,
                },
                message: "Tenant deactivated successfully",
            });
        }
        catch (error) {
            console.error("Deactivate tenant error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to deactivate tenant",
            });
        }
    }
    /**
     * Activate tenant (super_admin only)
     */
    static async activate(req, res) {
        try {
            if (!req.user || req.user.role !== "super_admin") {
                res.status(403).json({
                    success: false,
                    error: "super_admin access required",
                });
                return;
            }
            const { tenantId } = req.params;
            if (!tenantId) {
                res.status(400).json({
                    success: false,
                    error: "Tenant ID is required",
                });
                return;
            }
            const updatedTenantResult = await dbpool_1.default.query('UPDATE tenants SET is_active = true, updated_at = NOW() WHERE id = $1 RETURNING id, name, subdomain, is_active', [tenantId]);
            const updatedTenant = updatedTenantResult.rows[0];
            res.status(200).json({
                success: true,
                data: {
                    id: updatedTenant.id,
                    name: updatedTenant.name,
                    subdomain: updatedTenant.subdomain,
                    isActive: updatedTenant.is_active,
                },
                message: "Tenant activated successfully",
            });
        }
        catch (error) {
            console.error("Activate tenant error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to activate tenant",
            });
        }
    }
    /**
     * Get all tenants with their web inquiry secret keys
     * Requires super_admin access
     */
    static async getAllTenants(req, res) {
        try {
            const tenantsResult = await dbpool_1.default.query('SELECT id, name, subdomain, web_inquiry_secret_key, plan_type, is_active, created_at FROM tenants ORDER BY created_at DESC');
            res.status(200).json({
                success: true,
                data: tenantsResult.rows,
            });
        }
        catch (error) {
            console.error("Get all tenants error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch tenants",
            });
        }
    }
    /**
     * Generate missing secret keys for all tenants
     * Requires super_admin access
     */
    static async generateMissingSecretKeys(req, res) {
        try {
            const crypto = require('crypto');
            const client = await dbpool_1.default.connect();
            try {
                await client.query('BEGIN');
                // Find tenants without a secret key
                const missingKeysResult = await client.query("SELECT id, subdomain FROM tenants WHERE web_inquiry_secret_key IS NULL OR web_inquiry_secret_key = ''");
                let generatedCount = 0;
                for (const tenant of missingKeysResult.rows) {
                    const secretKey = `${crypto.randomInt(10000, 100000)}/secretkey/${tenant.subdomain}`;
                    await client.query("UPDATE tenants SET web_inquiry_secret_key = $1, updated_at = NOW() WHERE id = $2", [secretKey, tenant.id]);
                    generatedCount++;
                }
                await client.query('COMMIT');
                res.status(200).json({
                    success: true,
                    message: `Generated secret keys for ${generatedCount} tenants`,
                    data: { generatedCount }
                });
            }
            catch (txError) {
                await client.query('ROLLBACK');
                throw txError;
            }
            finally {
                client.release();
            }
        }
        catch (error) {
            console.error("Generate missing secret keys error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to generate missing secret keys",
            });
        }
    }
    /**
     * Generate secret key for a specific tenant
     * Requires super_admin access
     */
    static async generateSecretKey(req, res) {
        try {
            const { tenantId } = req.params;
            if (!tenantId) {
                res.status(400).json({
                    success: false,
                    error: "Tenant ID is required",
                });
                return;
            }
            const tenantResult = await dbpool_1.default.query("SELECT subdomain FROM tenants WHERE id = $1", [tenantId]);
            if (tenantResult.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: "Tenant not found",
                });
                return;
            }
            const crypto = require('crypto');
            const subdomain = tenantResult.rows[0].subdomain;
            const secretKey = `${crypto.randomInt(10000, 100000)}/secretkey/${subdomain}`;
            const updateResult = await dbpool_1.default.query("UPDATE tenants SET web_inquiry_secret_key = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, subdomain, web_inquiry_secret_key", [secretKey, tenantId]);
            res.status(200).json({
                success: true,
                message: "Secret key generated successfully",
                data: updateResult.rows[0]
            });
        }
        catch (error) {
            console.error("Generate secret key error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to generate secret key",
            });
        }
    }
    /**
     * Get the current Chrome Extension install key for the active tenant (admin only).
     * The key lives in tenants.settings.extensionInstallKey (JSONB). Returns null
     * when none has been generated yet.
     */
    static async getExtensionInstallKey(req, res) {
        try {
            const tenantId = req.user?.tenantId || req.tenantId;
            if (!tenantId) {
                res.status(400).json({ success: false, error: "Tenant context is required" });
                return;
            }
            const result = await dbpool_1.default.query("SELECT settings->>'extensionInstallKey' AS key FROM tenants WHERE id = $1", [tenantId]);
            if (result.rows.length === 0) {
                res.status(404).json({ success: false, error: "Tenant not found" });
                return;
            }
            res.status(200).json({
                success: true,
                data: { installKey: result.rows[0].key || null },
            });
        }
        catch (error) {
            console.error("Get extension install key error:", error);
            res.status(500).json({ success: false, error: "Failed to get install key" });
        }
    }
    /**
     * Generate (or rotate) the Chrome Extension install key for the active tenant
     * (admin only). Distribute the returned key to that tenant's users; rotating
     * invalidates the previous key. Tenant is derived from the authenticated JWT.
     */
    static async generateExtensionInstallKey(req, res) {
        try {
            const tenantId = req.user?.tenantId || req.tenantId;
            if (!tenantId) {
                res.status(400).json({ success: false, error: "Tenant context is required" });
                return;
            }
            const tenantResult = await dbpool_1.default.query("SELECT subdomain FROM tenants WHERE id = $1", [tenantId]);
            if (tenantResult.rows.length === 0) {
                res.status(404).json({ success: false, error: "Tenant not found" });
                return;
            }
            const crypto = require("crypto");
            const subdomain = tenantResult.rows[0].subdomain;
            const installKey = `zk_${subdomain}_${crypto.randomBytes(18).toString("hex")}`;
            // Merge into the settings JSONB without clobbering other keys.
            await dbpool_1.default.query(`UPDATE tenants
           SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{extensionInstallKey}', to_jsonb($1::text)),
               updated_at = NOW()
         WHERE id = $2`, [installKey, tenantId]);
            res.status(200).json({
                success: true,
                message: "Install key generated successfully",
                data: { installKey },
            });
        }
        catch (error) {
            console.error("Generate extension install key error:", error);
            res.status(500).json({ success: false, error: "Failed to generate install key" });
        }
    }
    /**
     * POST /api/tenants/onboarding/complete
     * Mark the current tenant's onboarding as completed.
     * Tenant ID is always sourced from the authenticated JWT — never the request body.
     */
    static async completeOnboarding(req, res) {
        try {
            if (!req.user?.tenantId) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }
            await dbpool_1.default.query("UPDATE tenants SET onboarding_completed = true, updated_at = now() WHERE id = $1", [req.user.tenantId]);
            res.status(200).json({ success: true, message: "Onboarding marked as complete" });
        }
        catch (error) {
            console.error("Complete onboarding error:", error);
            res.status(500).json({ success: false, error: "Failed to complete onboarding" });
        }
    }
}
exports.TenantController = TenantController;
exports.default = TenantController;
//# sourceMappingURL=tenantController.js.map