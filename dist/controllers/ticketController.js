"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TicketController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
class TicketController {
    /**
     * Get dashboard statistics (tenant-aware)
     */
    static async getDashboardStats(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const currentDate = new Date();
            const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            const stats = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // General statistics
                const generalStats = await client.ticket.groupBy({
                    by: ['status'],
                    where: {
                        tenantId: req.tenantId,
                        createdAt: { gte: startOfMonth, lte: endOfMonth }
                    },
                    _count: true,
                });
                const totalTickets = generalStats.reduce((sum, stat) => sum + stat._count, 0);
                const statusCounts = {
                    total: totalTickets,
                    IN_PROGRESS: generalStats.find(s => s.status === 'IN_PROGRESS')?._count || 0,
                    NOT_STARTED: generalStats.find(s => s.status === 'NOT_STARTED')?._count || 0,
                    COMPLETED: generalStats.find(s => s.status === 'COMPLETED')?._count || 0,
                    BLOCKED: generalStats.find(s => s.status === 'BLOCKED')?._count || 0
                };
                // Project-wise statistics
                const projectStats = await client.ticket.groupBy({
                    by: ['projectId', 'status'],
                    where: {
                        tenantId: req.tenantId,
                        createdAt: { gte: startOfMonth, lte: endOfMonth }
                    },
                    _count: true,
                });
                // Priority distribution
                const priorityStats = await client.ticket.groupBy({
                    by: ['priority'],
                    where: {
                        tenantId: req.tenantId,
                        createdAt: { gte: startOfMonth, lte: endOfMonth }
                    },
                    _count: true,
                });
                // Recent activity
                const recentActivity = await client.ticket.findMany({
                    where: {
                        tenantId: req.tenantId,
                        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                    },
                    include: {
                        createdBy: { select: { name: true } },
                        assignee: { select: { name: true } }
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 10
                });
                // Team member statistics
                const teamStats = await client.ticket.groupBy({
                    by: ['assigneeId', 'status'],
                    where: {
                        tenantId: req.tenantId,
                        createdAt: { gte: startOfMonth, lte: endOfMonth }
                    },
                    _count: true,
                });
                return {
                    generalStats: statusCounts,
                    projectStats,
                    priorityStats,
                    recentActivity,
                    teamStats,
                    period: {
                        start: startOfMonth,
                        end: endOfMonth,
                        month: currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })
                    }
                };
            });
            res.status(200).json({
                success: true,
                data: stats
            });
        }
        catch (error) {
            console.error('Get dashboard stats error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch dashboard statistics'
            });
        }
    }
    /**
     * Create a new ticket (tenant-aware)
     */
    static async createTicket(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { title, description, projectId, status = 'NOT_STARTED', priority = 'MEDIUM', type = 'TASK', assigneeId, dueDate, tags = [], metadata = {} } = req.body;
            // Validate required fields
            if (!title || !projectId) {
                res.status(400).json({
                    success: false,
                    error: 'Title and projectId are required'
                });
                return;
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
                // Validate assignee if provided
                if (assigneeId) {
                    const assignee = await client.user.findFirst({
                        where: {
                            id: assigneeId,
                            tenantId: req.tenantId,
                            isActive: true,
                        }
                    });
                    if (!assignee) {
                        throw new types_1.ValidationError('Assignee not found in this tenant');
                    }
                }
                // Generate ticket number
                const ticketCount = await client.ticket.count({
                    where: { tenantId: req.tenantId }
                });
                const ticketNumber = `${project.code || 'TKT'}-${(ticketCount + 1).toString().padStart(4, '0')}`;
                // Create ticket
                const ticket = await client.ticket.create({
                    data: {
                        tenantId: req.tenantId,
                        title,
                        description,
                        projectId,
                        status,
                        priority,
                        type,
                        assigneeId,
                        createdById: req.user.id,
                        dueDate: dueDate ? new Date(dueDate) : null,
                        tags,
                        metadata,
                        ticketNumber,
                    },
                    include: {
                        createdBy: { select: { id: true, name: true, workEmail: true } },
                        assignee: { select: { id: true, name: true, workEmail: true } },
                        project: { select: { id: true, name: true, code: true } }
                    }
                });
                res.status(201).json({
                    success: true,
                    data: ticket,
                    message: 'Ticket created successfully'
                });
            });
        }
        catch (error) {
            console.error('Create ticket error:', error);
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to create ticket'
            });
        }
    }
    /**
     * Get all tickets with filtering, sorting, and pagination (tenant-aware)
     */
    static async getTickets(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { page = 1, limit = 20, status, priority, projectId, assigneeId, createdById, search, sortBy = 'createdAt', sortOrder = 'desc', startDate, endDate } = req.query;
            // Get user's accessible projects
            const userId = req.user.id;
            const userProjects = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                return await client.project.findMany({
                    where: {
                        tenantId: req.tenantId,
                        OR: [
                            { projectManagerId: userId },
                            { members: { some: { userId: userId } } }
                        ],
                        status: 'ACTIVE'
                    },
                    select: { id: true }
                });
            });
            const userProjectIds = userProjects.map(p => p.id);
            // Build filter query
            const where = {
                tenantId: req.tenantId,
                projectId: { in: userProjectIds } // Only tickets from user's projects
            };
            if (status)
                where.status = status;
            if (priority)
                where.priority = priority;
            if (projectId)
                where.projectId = projectId; // Override with specific project if provided
            if (assigneeId)
                where.assigneeId = assigneeId;
            if (createdById)
                where.createdById = createdById;
            if (search) {
                where.OR = [
                    { title: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } },
                    { ticketNumber: { contains: search, mode: 'insensitive' } }
                ];
            }
            if (startDate || endDate) {
                where.createdAt = {};
                if (startDate)
                    where.createdAt.gte = new Date(startDate);
                if (endDate)
                    where.createdAt.lte = new Date(endDate);
            }
            // Build sort object
            const orderBy = {};
            orderBy[sortBy] = sortOrder === 'desc' ? 'desc' : 'asc';
            // Execute query with pagination
            const skip = (Number(page) - 1) * Number(limit);
            const [tickets, total] = await Promise.all([
                database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                    return await client.ticket.findMany({
                        where,
                        include: {
                            createdBy: { select: { name: true, workEmail: true } },
                            assignee: { select: { name: true, workEmail: true } },
                            project: { select: { name: true, code: true, description: true } }
                        },
                        orderBy,
                        skip,
                        take: Number(limit),
                    });
                }),
                database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                    return await client.ticket.count({ where });
                })
            ]);
            const totalPages = Math.ceil(total / Number(limit));
            res.status(200).json({
                success: true,
                data: tickets,
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
            console.error('Get tickets error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch tickets'
            });
        }
    }
    /**
     * Get ticket by ID with full details (tenant-aware)
     */
    static async getTicketById(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const ticket = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                return await client.ticket.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    },
                    include: {
                        createdBy: { select: { id: true, name: true, workEmail: true, position: true } },
                        assignee: { select: { id: true, name: true, workEmail: true, position: true } },
                        project: {
                            select: {
                                id: true,
                                name: true,
                                code: true,
                                description: true,
                                projectManager: { select: { name: true, workEmail: true } }
                            }
                        }
                    }
                });
            });
            if (!ticket) {
                res.status(404).json({
                    success: false,
                    error: 'Ticket not found'
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: ticket
            });
        }
        catch (error) {
            console.error('Get ticket by ID error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch ticket'
            });
        }
    }
    /**
     * Update ticket (tenant-aware)
     */
    static async updateTicket(req, res) {
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
            delete updates.createdById;
            delete updates.tenantId;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Check if ticket exists and belongs to tenant
                const existingTicket = await client.ticket.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!existingTicket) {
                    throw new types_1.NotFoundError('Ticket not found in this tenant');
                }
                // Validate assignee if provided
                if (updates.assigneeId) {
                    const assignee = await client.user.findFirst({
                        where: {
                            id: updates.assigneeId,
                            tenantId: req.tenantId,
                            isActive: true,
                        }
                    });
                    if (!assignee) {
                        throw new types_1.ValidationError('Assignee not found in this tenant');
                    }
                }
                // Convert date strings to Date objects
                if (updates.dueDate)
                    updates.dueDate = new Date(updates.dueDate);
                // Set completion date if status changed to COMPLETED
                let updateData = {
                    ...updates,
                    updatedAt: new Date()
                };
                if (updates.status === 'COMPLETED' && existingTicket.status !== 'COMPLETED') {
                    updateData.completedAt = new Date();
                }
                else if (updates.status !== 'COMPLETED') {
                    updateData.completedAt = null;
                }
                const ticket = await client.ticket.update({
                    where: { id },
                    data: updateData,
                    include: {
                        createdBy: { select: { id: true, name: true, workEmail: true } },
                        assignee: { select: { id: true, name: true, workEmail: true } },
                        project: { select: { id: true, name: true, code: true } }
                    }
                });
                res.status(200).json({
                    success: true,
                    data: ticket,
                    message: 'Ticket updated successfully'
                });
            });
        }
        catch (error) {
            console.error('Update ticket error:', error);
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
                error: 'Failed to update ticket'
            });
        }
    }
    /**
     * Delete ticket (tenant-aware)
     */
    static async deleteTicket(req, res) {
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
                const ticket = await client.ticket.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!ticket) {
                    throw new types_1.NotFoundError('Ticket not found in this tenant');
                }
                await client.ticket.delete({
                    where: { id }
                });
                res.status(200).json({
                    success: true,
                    message: 'Ticket deleted successfully'
                });
            });
        }
        catch (error) {
            console.error('Delete ticket error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to delete ticket'
            });
        }
    }
    /**
     * Get tickets assigned to current user (tenant-aware)
     */
    static async getMyTickets(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { page = 1, limit = 20, status, priority } = req.query;
            const where = {
                tenantId: req.tenantId,
                assigneeId: req.user.id
            };
            if (status)
                where.status = status;
            if (priority)
                where.priority = priority;
            const skip = (Number(page) - 1) * Number(limit);
            const [tickets, total] = await Promise.all([
                database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                    return await client.ticket.findMany({
                        where,
                        include: {
                            createdBy: { select: { name: true, workEmail: true } },
                            project: { select: { name: true, code: true } }
                        },
                        orderBy: { createdAt: 'desc' },
                        skip,
                        take: Number(limit),
                    });
                }),
                database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                    return await client.ticket.count({ where });
                })
            ]);
            const totalPages = Math.ceil(total / Number(limit));
            res.status(200).json({
                success: true,
                data: tickets,
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
            console.error('Get my tickets error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch your tickets'
            });
        }
    }
    /**
     * Bulk update ticket status (tenant-aware)
     */
    static async bulkUpdateStatus(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { ticketIds, status } = req.body;
            if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'Ticket IDs array is required'
                });
                return;
            }
            if (!status) {
                res.status(400).json({
                    success: false,
                    error: 'Status is required'
                });
                return;
            }
            const updateData = {
                status,
                updatedAt: new Date()
            };
            if (status === 'COMPLETED') {
                updateData.completedAt = new Date();
            }
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                const result = await client.ticket.updateMany({
                    where: {
                        id: { in: ticketIds },
                        tenantId: req.tenantId,
                    },
                    data: updateData
                });
                res.status(200).json({
                    success: true,
                    data: { updatedCount: result.count },
                    message: `${result.count} tickets updated successfully`
                });
            });
        }
        catch (error) {
            console.error('Bulk update status error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update tickets'
            });
        }
    }
    /**
     * Get ticket statistics by project (tenant-aware)
     */
    static async getTicketStatsByProject(req, res) {
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
                // Verify project exists and user has access
                const project = await client.project.findFirst({
                    where: {
                        id: projectId,
                        tenantId: req.tenantId,
                        OR: [
                            { projectManagerId: req.user.id },
                            { members: { some: { userId: req.user.id } } }
                        ]
                    }
                });
                if (!project) {
                    throw new types_1.NotFoundError('Project not found or access denied');
                }
                const stats = await client.ticket.groupBy({
                    by: ['status', 'priority'],
                    where: {
                        projectId,
                        tenantId: req.tenantId,
                    },
                    _count: true,
                });
                const totalTickets = await client.ticket.count({
                    where: { projectId, tenantId: req.tenantId }
                });
                const recentTickets = await client.ticket.findMany({
                    where: { projectId, tenantId: req.tenantId },
                    include: {
                        assignee: { select: { name: true, workEmail: true } },
                        createdBy: { select: { name: true, workEmail: true } }
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 10
                });
                res.status(200).json({
                    success: true,
                    data: {
                        projectId,
                        totalTickets,
                        stats,
                        recentTickets
                    }
                });
            });
        }
        catch (error) {
            console.error('Get ticket stats by project error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to fetch ticket statistics'
            });
        }
    }
}
exports.TicketController = TicketController;
exports.default = TicketController;
//# sourceMappingURL=ticketController.js.map