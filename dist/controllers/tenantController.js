"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("@/config/database");
const types_1 = require("@/types");
class TenantController {
    /**
     * Register a new tenant with admin user (public endpoint)
     */
    static async register(req, res) {
        try {
            const tenantData = req.body;
            // Validate required fields
            if (!tenantData.name || !tenantData.subdomain || !tenantData.adminUser) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant name, subdomain, and admin user information are required',
                });
                return;
            }
            const rawClient = database_1.tenantAwarePrisma.getRawClient();
            // Check if subdomain is already taken
            const existingTenant = await rawClient.tenant.findUnique({
                where: { subdomain: tenantData.subdomain.toLowerCase() }
            });
            if (existingTenant) {
                res.status(409).json({
                    success: false,
                    error: 'Subdomain is already taken',
                });
                return;
            }
            // Validate subdomain format
            const subdomainRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
            if (!subdomainRegex.test(tenantData.subdomain) || tenantData.subdomain.length < 3) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid subdomain format. Must be lowercase, alphanumeric with hyphens, minimum 3 characters',
                });
                return;
            }
            // Hash admin password
            const passwordHash = await bcryptjs_1.default.hash(tenantData.adminUser.password, 12);
            // Create tenant and admin user in transaction
            const result = await rawClient.$transaction(async (tx) => {
                // Create tenant
                const tenant = await tx.tenant.create({
                    data: {
                        name: tenantData.name,
                        subdomain: tenantData.subdomain.toLowerCase(),
                        planType: tenantData.planType || 'basic',
                        maxUsers: tenantData.maxUsers || 10,
                        settings: tenantData.settings || {},
                    }
                });
                // Create admin user
                const adminUser = await tx.user.create({
                    data: {
                        tenantId: tenant.id,
                        name: tenantData.adminUser.name,
                        workEmail: tenantData.adminUser.email.toLowerCase(),
                        personalEmail: tenantData.adminUser.email.toLowerCase(),
                        phone: tenantData.adminUser.phone,
                        passwordHash,
                        role: 'admin',
                        position: 'Administrator',
                        workDays: [1, 2, 3, 4, 5], // Monday to Friday
                    }
                });
                return { tenant, adminUser };
            });
            res.status(201).json({
                success: true,
                data: {
                    tenant: {
                        id: result.tenant.id,
                        name: result.tenant.name,
                        subdomain: result.tenant.subdomain,
                        planType: result.tenant.planType,
                    },
                    adminUser: {
                        id: result.adminUser.id,
                        name: result.adminUser.name,
                        email: result.adminUser.workEmail,
                    }
                },
                message: 'Tenant registered successfully',
            });
        }
        catch (error) {
            console.error('Tenant registration error:', error);
            if (error.code === 'P2002') {
                res.status(409).json({
                    success: false,
                    error: 'Subdomain or email already exists',
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to register tenant',
            });
        }
    }
    /**
     * Resolve tenant by subdomain (public endpoint for frontend)
     */
    static async resolve(req, res) {
        try {
            const { subdomain } = req.query;
            if (!subdomain || typeof subdomain !== 'string') {
                res.status(400).json({
                    success: false,
                    error: 'Subdomain parameter is required',
                });
                return;
            }
            const rawClient = database_1.tenantAwarePrisma.getRawClient();
            const tenant = await rawClient.tenant.findFirst({
                where: {
                    subdomain: subdomain.toLowerCase(),
                    isActive: true,
                },
                select: {
                    id: true,
                    name: true,
                    subdomain: true,
                    planType: true,
                    isActive: true,
                }
            });
            if (!tenant) {
                res.status(404).json({
                    success: false,
                    error: 'Tenant not found',
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
                        planType: tenant.planType,
                        isActive: tenant.isActive,
                    }
                },
            });
        }
        catch (error) {
            console.error('Tenant resolution error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to resolve tenant',
            });
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
                    error: 'Tenant context is required',
                });
                return;
            }
            const rawClient = database_1.tenantAwarePrisma.getRawClient();
            const tenant = await rawClient.tenant.findUnique({
                where: { id: req.tenantId },
                include: {
                    _count: {
                        select: {
                            users: { where: { isActive: true } },
                            projects: true,
                        }
                    }
                }
            });
            if (!tenant) {
                throw new types_1.NotFoundError('Tenant not found');
            }
            res.status(200).json({
                success: true,
                data: {
                    id: tenant.id,
                    name: tenant.name,
                    subdomain: tenant.subdomain,
                    planType: tenant.planType,
                    maxUsers: tenant.maxUsers,
                    isActive: tenant.isActive,
                    settings: tenant.settings,
                    stats: {
                        activeUsers: tenant._count.users,
                        totalProjects: tenant._count.projects,
                    },
                    createdAt: tenant.createdAt,
                    updatedAt: tenant.updatedAt,
                },
            });
        }
        catch (error) {
            console.error('Get tenant profile error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get tenant profile',
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
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            // Check if user is admin
            if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
                res.status(403).json({
                    success: false,
                    error: 'admin access required',
                });
                return;
            }
            const updateData = req.body;
            // Remove sensitive fields that shouldn't be updated directly
            delete updateData.id;
            delete updateData.subdomain; // Subdomain changes require special handling
            delete updateData.createdAt;
            delete updateData.updatedAt;
            const rawClient = database_1.tenantAwarePrisma.getRawClient();
            const updatedTenant = await rawClient.tenant.update({
                where: { id: req.tenantId },
                data: updateData,
            });
            res.status(200).json({
                success: true,
                data: {
                    id: updatedTenant.id,
                    name: updatedTenant.name,
                    subdomain: updatedTenant.subdomain,
                    planType: updatedTenant.planType,
                    maxUsers: updatedTenant.maxUsers,
                    isActive: updatedTenant.isActive,
                    settings: updatedTenant.settings,
                },
                message: 'Tenant profile updated successfully',
            });
        }
        catch (error) {
            console.error('Update tenant profile error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update tenant profile',
            });
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
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const stats = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                const [totalUsers, activeUsers, totalProjects, activeProjects, totalTickets, openTickets,] = await Promise.all([
                    client.user.count({ where: { tenantId: req.tenantId } }),
                    client.user.count({ where: { tenantId: req.tenantId, isActive: true } }),
                    client.project.count({ where: { tenantId: req.tenantId } }),
                    client.project.count({ where: { tenantId: req.tenantId, status: 'active' } }),
                    client.ticket.count({ where: { tenantId: req.tenantId } }),
                    client.ticket.count({ where: { tenantId: req.tenantId, status: 'open' } }),
                ]);
                return {
                    users: { total: totalUsers, active: activeUsers },
                    projects: { total: totalProjects, active: activeProjects },
                    tickets: { total: totalTickets, open: openTickets },
                };
            });
            res.status(200).json({
                success: true,
                data: stats,
            });
        }
        catch (error) {
            console.error('Get tenant statistics error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get tenant statistics',
            });
        }
    }
    /**
     * Check subdomain availability (public endpoint)
     */
    static async checkSubdomainAvailability(req, res) {
        try {
            const { subdomain } = req.query;
            if (!subdomain || typeof subdomain !== 'string') {
                res.status(400).json({
                    success: false,
                    error: 'Subdomain parameter is required',
                });
                return;
            }
            // Validate subdomain format
            const subdomainRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
            if (!subdomainRegex.test(subdomain) || subdomain.length < 3) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid subdomain format',
                    data: { available: false, reason: 'Invalid format' }
                });
                return;
            }
            // Check reserved subdomains
            const reservedSubdomains = ['www', 'api', 'admin', 'app', 'mail', 'ftp', 'cdn'];
            if (reservedSubdomains.includes(subdomain.toLowerCase())) {
                res.status(400).json({
                    success: false,
                    error: 'Subdomain is reserved',
                    data: { available: false, reason: 'Reserved subdomain' }
                });
                return;
            }
            const rawClient = database_1.tenantAwarePrisma.getRawClient();
            const existingTenant = await rawClient.tenant.findUnique({
                where: { subdomain: subdomain.toLowerCase() }
            });
            res.status(200).json({
                success: true,
                data: {
                    available: !existingTenant,
                    subdomain: subdomain.toLowerCase(),
                },
            });
        }
        catch (error) {
            console.error('Check subdomain availability error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to check subdomain availability',
            });
        }
    }
    /**
     * Deactivate tenant (super_admin only)
     */
    static async deactivate(req, res) {
        try {
            if (!req.user || req.user.role !== 'super_admin') {
                res.status(403).json({
                    success: false,
                    error: 'super_admin access required',
                });
                return;
            }
            const { tenantId } = req.params;
            if (!tenantId) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant ID is required',
                });
                return;
            }
            const rawClient = database_1.tenantAwarePrisma.getRawClient();
            const updatedTenant = await rawClient.tenant.update({
                where: { id: tenantId },
                data: { isActive: false, updatedAt: new Date() },
            });
            res.status(200).json({
                success: true,
                data: {
                    id: updatedTenant.id,
                    name: updatedTenant.name,
                    subdomain: updatedTenant.subdomain,
                    isActive: updatedTenant.isActive,
                },
                message: 'Tenant deactivated successfully',
            });
        }
        catch (error) {
            console.error('Deactivate tenant error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to deactivate tenant',
            });
        }
    }
    /**
     * Activate tenant (super_admin only)
     */
    static async activate(req, res) {
        try {
            if (!req.user || req.user.role !== 'super_admin') {
                res.status(403).json({
                    success: false,
                    error: 'super_admin access required',
                });
                return;
            }
            const { tenantId } = req.params;
            if (!tenantId) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant ID is required',
                });
                return;
            }
            const rawClient = database_1.tenantAwarePrisma.getRawClient();
            const updatedTenant = await rawClient.tenant.update({
                where: { id: tenantId },
                data: { isActive: true, updatedAt: new Date() },
            });
            res.status(200).json({
                success: true,
                data: {
                    id: updatedTenant.id,
                    name: updatedTenant.name,
                    subdomain: updatedTenant.subdomain,
                    isActive: updatedTenant.isActive,
                },
                message: 'Tenant activated successfully',
            });
        }
        catch (error) {
            console.error('Activate tenant error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to activate tenant',
            });
        }
    }
}
exports.TenantController = TenantController;
exports.default = TenantController;
//# sourceMappingURL=tenantController.js.map