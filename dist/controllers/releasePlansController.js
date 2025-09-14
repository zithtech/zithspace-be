"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReleasePlansController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
class ReleasePlansController {
    /**
     * Get all release plans with filtering and pagination (tenant-aware)
     */
    static async getReleasePlans(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { page = 1, limit = 20, projectId, status, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
            // Build filter query
            const where = {
                tenantId: req.tenantId,
            };
            if (projectId)
                where.projectId = projectId;
            if (status)
                where.status = status;
            if (search) {
                where.OR = [
                    { version: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } }
                ];
            }
            // Build sort object
            const orderBy = {};
            orderBy[sortBy] = sortOrder === 'desc' ? 'desc' : 'asc';
            // Execute query with pagination
            const skip = (Number(page) - 1) * Number(limit);
            const [releasePlans, total] = await Promise.all([
                database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                    return await client.releasePlan.findMany({
                        where,
                        include: {
                            project: {
                                select: { id: true, name: true, code: true }
                            },
                            createdBy: {
                                select: { id: true, name: true, workEmail: true }
                            }
                        },
                        orderBy,
                        skip,
                        take: Number(limit),
                    });
                }),
                database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                    return await client.releasePlan.count({ where });
                })
            ]);
            const totalPages = Math.ceil(total / Number(limit));
            res.status(200).json({
                success: true,
                data: releasePlans,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: totalPages,
                    hasNext: Number(page) < totalPages,
                    hasPrev: Number(page) > 1
                }
            });
        }
        catch (error) {
            console.error('Get release plans error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch release plans'
            });
        }
    }
    /**
     * Get release plan by ID (tenant-aware)
     */
    static async getReleasePlanById(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const releasePlan = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                return await client.releasePlan.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    },
                    include: {
                        project: {
                            select: { id: true, name: true, code: true }
                        },
                        createdBy: {
                            select: { id: true, name: true, workEmail: true, position: true }
                        },
                        // Get associated tickets through the project relation
                        tickets: {
                            select: {
                                id: true,
                                title: true,
                                status: true,
                                priority: true,
                                assigneeId: true,
                                createdAt: true,
                                assignee: {
                                    select: { id: true, name: true, workEmail: true }
                                }
                            },
                            orderBy: { createdAt: 'desc' }
                        }
                    }
                });
            });
            if (!releasePlan) {
                res.status(404).json({
                    success: false,
                    error: 'Release plan not found'
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: releasePlan
            });
        }
        catch (error) {
            console.error('Get release plan by ID error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch release plan'
            });
        }
    }
    /**
     * Create new release plan (tenant-aware)
     */
    static async createReleasePlan(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { version, description, projectId, releaseDate, status = 'planning' } = req.body;
            // Validate required fields
            if (!version || !description || !projectId) {
                res.status(400).json({
                    success: false,
                    error: 'Version, description, and project ID are required'
                });
                return;
            }
            // Validate release date if provided
            if (releaseDate) {
                const releaseDateObj = new Date(releaseDate);
                if (releaseDateObj <= new Date()) {
                    res.status(400).json({
                        success: false,
                        error: 'Release date must be in the future'
                    });
                    return;
                }
            }
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Validate project exists and belongs to tenant
                const project = await client.project.findFirst({
                    where: {
                        id: projectId,
                        tenantId: req.tenantId,
                    }
                });
                if (!project) {
                    throw new types_1.ValidationError('Project not found in this tenant');
                }
                // Check if release plan with same version already exists for this project
                const existingReleasePlan = await client.releasePlan.findFirst({
                    where: {
                        version,
                        projectId,
                        tenantId: req.tenantId,
                    }
                });
                if (existingReleasePlan) {
                    throw new types_1.ValidationError('Release plan with this version already exists for this project');
                }
                // Create release plan
                const newReleasePlan = await client.releasePlan.create({
                    data: {
                        tenantId: req.tenantId,
                        projectId,
                        version,
                        description,
                        status,
                        releaseDate: releaseDate ? new Date(releaseDate) : null,
                        createdById: req.user.id,
                    },
                    include: {
                        project: {
                            select: { id: true, name: true, code: true }
                        },
                        createdBy: {
                            select: { id: true, name: true, workEmail: true }
                        }
                    }
                });
                res.status(201).json({
                    success: true,
                    data: newReleasePlan,
                    message: 'Release plan created successfully'
                });
            });
        }
        catch (error) {
            console.error('Create release plan error:', error);
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to create release plan'
            });
        }
    }
    /**
     * Update release plan (tenant-aware)
     */
    static async updateReleasePlan(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const updates = req.body;
            // Remove fields that shouldn't be updated directly
            delete updates.tenantId;
            delete updates.createdById;
            delete updates.createdAt;
            // Validate release date if being updated
            if (updates.releaseDate) {
                const releaseDateObj = new Date(updates.releaseDate);
                if (releaseDateObj <= new Date()) {
                    res.status(400).json({
                        success: false,
                        error: 'Release date must be in the future'
                    });
                    return;
                }
            }
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Check if release plan exists and belongs to tenant
                const existingReleasePlan = await client.releasePlan.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!existingReleasePlan) {
                    throw new types_1.NotFoundError('Release plan not found in this tenant');
                }
                // Check for version conflicts if version is being updated
                if (updates.version && updates.version !== existingReleasePlan.version) {
                    const duplicateReleasePlan = await client.releasePlan.findFirst({
                        where: {
                            version: updates.version,
                            projectId: existingReleasePlan.projectId,
                            tenantId: req.tenantId,
                            id: { not: id }
                        }
                    });
                    if (duplicateReleasePlan) {
                        throw new types_1.ValidationError('Release plan with this version already exists for this project');
                    }
                }
                // Convert date if provided
                if (updates.releaseDate)
                    updates.releaseDate = new Date(updates.releaseDate);
                const updatedReleasePlan = await client.releasePlan.update({
                    where: { id },
                    data: {
                        ...updates,
                        updatedAt: new Date()
                    },
                    include: {
                        project: {
                            select: { id: true, name: true, code: true }
                        },
                        createdBy: {
                            select: { id: true, name: true, workEmail: true }
                        }
                    }
                });
                res.status(200).json({
                    success: true,
                    data: updatedReleasePlan,
                    message: 'Release plan updated successfully'
                });
            });
        }
        catch (error) {
            console.error('Update release plan error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to update release plan'
            });
        }
    }
    /**
     * Delete release plan (tenant-aware)
     */
    static async deleteReleasePlan(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                const existingReleasePlan = await client.releasePlan.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!existingReleasePlan) {
                    throw new types_1.NotFoundError('Release plan not found in this tenant');
                }
                // Check if any tickets are associated with this release plan
                const ticketsCount = await client.ticket.count({
                    where: {
                        releasePlanId: id,
                        tenantId: req.tenantId,
                    }
                });
                if (ticketsCount > 0) {
                    // Remove release plan reference from tickets instead of preventing deletion
                    await client.ticket.updateMany({
                        where: {
                            releasePlanId: id,
                            tenantId: req.tenantId,
                        },
                        data: {
                            releasePlanId: null,
                            updatedAt: new Date()
                        }
                    });
                }
                await client.releasePlan.delete({
                    where: { id }
                });
                res.status(200).json({
                    success: true,
                    message: 'Release plan deleted successfully'
                });
            });
        }
        catch (error) {
            console.error('Delete release plan error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to delete release plan'
            });
        }
    }
    /**
     * Get release plans by project (tenant-aware)
     */
    static async getReleasePlansByProject(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { projectId } = req.params;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Validate project exists and belongs to tenant
                const project = await client.project.findFirst({
                    where: {
                        id: projectId,
                        tenantId: req.tenantId,
                    }
                });
                if (!project) {
                    throw new types_1.NotFoundError('Project not found in this tenant');
                }
                const releasePlans = await client.releasePlan.findMany({
                    where: {
                        projectId,
                        tenantId: req.tenantId,
                    },
                    include: {
                        createdBy: {
                            select: { id: true, name: true, workEmail: true }
                        }
                    },
                    orderBy: { createdAt: 'desc' }
                });
                res.status(200).json({
                    success: true,
                    data: {
                        project,
                        releasePlans,
                        total: releasePlans.length
                    }
                });
            });
        }
        catch (error) {
            console.error('Get release plans by project error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to fetch release plans by project'
            });
        }
    }
    /**
     * Get active release plans (tenant-aware)
     */
    static async getActiveReleasePlans(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const releasePlans = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                return await client.releasePlan.findMany({
                    where: {
                        tenantId: req.tenantId,
                        status: { in: ['planning', 'active'] },
                        OR: [
                            { releaseDate: null },
                            { releaseDate: { gte: new Date() } }
                        ]
                    },
                    include: {
                        project: {
                            select: { id: true, name: true, code: true }
                        },
                        createdBy: {
                            select: { id: true, name: true, workEmail: true }
                        }
                    },
                    orderBy: [
                        { releaseDate: 'asc' },
                        { createdAt: 'desc' }
                    ]
                });
            });
            res.status(200).json({
                success: true,
                data: releasePlans
            });
        }
        catch (error) {
            console.error('Get active release plans error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch active release plans'
            });
        }
    }
    /**
     * Get release plan statistics (tenant-aware)
     */
    static async getReleasePlanStats(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const stats = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Overall statistics
                const overallStats = await client.releasePlan.groupBy({
                    by: ['status'],
                    where: { tenantId: req.tenantId },
                    _count: true
                });
                // Project-wise statistics - simplified to avoid circular reference
                const projectStats = await client.releasePlan.findMany({
                    where: { tenantId: req.tenantId },
                    select: {
                        projectId: true,
                        status: true,
                        project: {
                            select: { name: true }
                        }
                    }
                });
                // Format overall stats
                const statusSummary = {
                    planning: 0,
                    active: 0,
                    completed: 0,
                    cancelled: 0,
                    total: 0
                };
                overallStats.forEach((item) => {
                    const count = item._count || 0;
                    statusSummary.total += count;
                    switch (item.status) {
                        case 'planning':
                            statusSummary.planning = count;
                            break;
                        case 'active':
                            statusSummary.active = count;
                            break;
                        case 'completed':
                            statusSummary.completed = count;
                            break;
                        case 'cancelled':
                            statusSummary.cancelled = count;
                            break;
                    }
                });
                // Get projects with their release plan counts
                const projectsWithCounts = await client.project.findMany({
                    where: { tenantId: req.tenantId },
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        _count: {
                            select: {
                                releasePlans: true
                            }
                        }
                    },
                    orderBy: {
                        releasePlans: {
                            _count: 'desc'
                        }
                    }
                });
                return {
                    overview: statusSummary,
                    projectBreakdown: projectsWithCounts,
                    rawProjectStats: projectStats
                };
            });
            res.status(200).json({
                success: true,
                data: stats
            });
        }
        catch (error) {
            console.error('Get release plan stats error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch release plan statistics'
            });
        }
    }
    /**
     * Get tickets available for assignment to release plan (tenant-aware)
     */
    static async getAvailableTickets(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { projectId } = req.params;
            const { search, limit = 10, excludeReleasePlan } = req.query;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Validate project exists and belongs to tenant
                const project = await client.project.findFirst({
                    where: {
                        id: projectId,
                        tenantId: req.tenantId,
                    }
                });
                if (!project) {
                    throw new types_1.NotFoundError('Project not found in this tenant');
                }
                // Build filter query
                const where = {
                    projectId,
                    tenantId: req.tenantId,
                };
                // Exclude tickets already assigned to the current release plan being edited
                if (excludeReleasePlan) {
                    where.releasePlanId = { not: excludeReleasePlan };
                }
                // Add search functionality
                if (search) {
                    where.OR = [
                        { title: { contains: search, mode: 'insensitive' } },
                        { description: { contains: search, mode: 'insensitive' } }
                    ];
                }
                const tickets = await client.ticket.findMany({
                    where,
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        priority: true,
                        createdAt: true,
                        assignee: {
                            select: { id: true, name: true, workEmail: true }
                        },
                        createdBy: {
                            select: { id: true, name: true, workEmail: true }
                        }
                    },
                    orderBy: { createdAt: 'desc' },
                    take: Number(limit)
                });
                res.status(200).json({
                    success: true,
                    data: tickets
                });
            });
        }
        catch (error) {
            console.error('Get available tickets error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to fetch available tickets'
            });
        }
    }
    /**
     * Assign tickets to release plan (tenant-aware)
     */
    static async assignTicketsToReleasePlan(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const { ticketIds } = req.body;
            if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'Ticket IDs are required'
                });
                return;
            }
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Validate release plan exists and belongs to tenant
                const releasePlan = await client.releasePlan.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!releasePlan) {
                    throw new types_1.NotFoundError('Release plan not found in this tenant');
                }
                // Validate all tickets exist and belong to the same project and tenant
                const tickets = await client.ticket.findMany({
                    where: {
                        id: { in: ticketIds },
                        projectId: releasePlan.projectId,
                        tenantId: req.tenantId,
                    }
                });
                if (tickets.length !== ticketIds.length) {
                    throw new types_1.ValidationError('Some tickets not found or do not belong to the same project');
                }
                // Assign tickets to release plan
                const result = await client.ticket.updateMany({
                    where: {
                        id: { in: ticketIds },
                        tenantId: req.tenantId,
                    },
                    data: {
                        releasePlanId: id,
                        updatedAt: new Date()
                    }
                });
                res.status(200).json({
                    success: true,
                    message: `${result.count} tickets assigned to release plan successfully`,
                    data: { assignedCount: result.count }
                });
            });
        }
        catch (error) {
            console.error('Assign tickets to release plan error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to assign tickets to release plan'
            });
        }
    }
    /**
     * Remove tickets from release plan (tenant-aware)
     */
    static async removeTicketsFromReleasePlan(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const { ticketIds } = req.body;
            if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'Ticket IDs are required'
                });
                return;
            }
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Validate release plan exists and belongs to tenant
                const releasePlan = await client.releasePlan.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!releasePlan) {
                    throw new types_1.NotFoundError('Release plan not found in this tenant');
                }
                // Remove tickets from release plan
                const result = await client.ticket.updateMany({
                    where: {
                        id: { in: ticketIds },
                        releasePlanId: id,
                        tenantId: req.tenantId,
                    },
                    data: {
                        releasePlanId: null,
                        updatedAt: new Date()
                    }
                });
                res.status(200).json({
                    success: true,
                    message: `${result.count} tickets removed from release plan successfully`,
                    data: { removedCount: result.count }
                });
            });
        }
        catch (error) {
            console.error('Remove tickets from release plan error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to remove tickets from release plan'
            });
        }
    }
}
exports.ReleasePlansController = ReleasePlansController;
exports.default = ReleasePlansController;
//# sourceMappingURL=releasePlansController.js.map