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
                    in_progress: generalStats.find(s => s.status === 'IN_PROGRESS')?._count || 0,
                    not_started: generalStats.find(s => s.status === 'NOT_STARTED')?._count || 0,
                    completed: generalStats.find(s => s.status === 'COMPLETED')?._count || 0,
                    blocked: generalStats.find(s => s.status === 'BLOCKED')?._count || 0
                };
                return {
                    generalStats: statusCounts,
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
            // Extract and map fields from request body
            const { title, description, status = 'NOT_STARTED', priority = 'MEDIUM', type = 'TASK', dueDate, tags = [], platform, stack, taskLevel, taskType, storyPoint, estimateHours, parentTickets = [], releasePlan } = req.body;
            // Map frontend field names to backend field names
            const projectId = req.body.project || req.body.projectId;
            const assigneeId = req.body.assignee || req.body.assigneeId;
            const reportToId = req.body.reportTo || req.body.reportToId;
            // Validate required fields
            if (!title || !projectId) {
                res.status(400).json({
                    success: false,
                    error: 'Title and project are required'
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
                            isActive: true
                        }
                    });
                    if (!assignee) {
                        throw new types_1.ValidationError('Assignee not found in this tenant');
                    }
                }
                // Validate reportTo if provided
                if (reportToId) {
                    const reportTo = await client.user.findFirst({
                        where: {
                            id: reportToId,
                            tenantId: req.tenantId,
                            isActive: true
                        }
                    });
                    if (!reportTo) {
                        throw new types_1.ValidationError('Report To user not found in this tenant');
                    }
                }
                // Generate ticket number
                const ticketCount = await client.ticket.count({
                    where: { tenantId: req.tenantId }
                });
                const ticketNumber = `${project.code || 'TKT'}-${(ticketCount + 1).toString().padStart(4, '0')}`;
                // Prepare metadata for additional fields not in schema
                const metadata = {
                    parentTickets,
                    releasePlan
                };
                // Create ticket with fields at root level (matching Prisma schema)
                const ticket = await client.ticket.create({
                    data: {
                        tenantId: req.tenantId,
                        title,
                        description: description || '',
                        projectId,
                        status,
                        priority,
                        type,
                        platform: platform || 'Development',
                        stack: stack || null,
                        taskLevel: taskLevel || 'Medium',
                        storyPoint: storyPoint || 1,
                        estimateHours: estimateHours || 0,
                        assigneeId: assigneeId || null,
                        reportToId: reportToId || null,
                        createdById: req.user.id,
                        parentTickets: parentTickets || [],
                        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
                        endDate: req.body.endDate ? new Date(req.body.endDate) : null,
                        dueDate: dueDate ? new Date(dueDate) : null,
                        tags,
                        metadata,
                        ticketNumber,
                    },
                    include: {
                        createdBy: { select: { id: true, name: true, workEmail: true, position: true } },
                        assignee: { select: { id: true, name: true, workEmail: true, position: true } },
                        reportTo: { select: { id: true, name: true, workEmail: true, position: true } },
                        project: { select: { id: true, name: true, code: true, description: true } }
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
            // Build filter query
            const where = {
                tenantId: req.tenantId
            };
            if (status)
                where.status = status;
            if (priority)
                where.priority = priority;
            if (projectId)
                where.projectId = projectId;
            // Handle single or multiple assignees
            if (assigneeId) {
                if (typeof assigneeId === 'string' && assigneeId.includes(',')) {
                    // Multiple assignees - split and use 'in' operator
                    where.assigneeId = { in: assigneeId.split(',').map(id => id.trim()) };
                }
                else {
                    // Single assignee
                    where.assigneeId = assigneeId;
                }
            }
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
                            createdBy: { select: { id: true, name: true, workEmail: true, position: true } },
                            assignee: { select: { id: true, name: true, workEmail: true, position: true } },
                            reportTo: { select: { id: true, name: true, workEmail: true, position: true } },
                            project: { select: { id: true, name: true, code: true, description: true } }
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
                        reportTo: { select: { id: true, name: true, workEmail: true, position: true } },
                        project: {
                            select: {
                                id: true,
                                name: true,
                                code: true,
                                description: true,
                                projectManager: { select: { name: true, workEmail: true } }
                            }
                        },
                        comments: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        workEmail: true,
                                        position: true,
                                    }
                                }
                            },
                            orderBy: { timestamp: 'asc' }
                        },
                        relatedLinks: {
                            include: {
                                addedBy: {
                                    select: {
                                        id: true,
                                        name: true,
                                        workEmail: true,
                                        position: true,
                                    }
                                }
                            },
                            orderBy: { addedAt: 'desc' }
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
            const ticket = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                const existingTicket = await client.ticket.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!existingTicket) {
                    throw new types_1.NotFoundError('Ticket not found in this tenant');
                }
                return await client.ticket.update({
                    where: { id },
                    data: {
                        ...updates,
                        updatedAt: new Date(),
                    },
                    include: {
                        createdBy: { select: { id: true, name: true, workEmail: true } },
                        assignee: { select: { id: true, name: true, workEmail: true } },
                        project: { select: { id: true, name: true, code: true } }
                    }
                });
            });
            res.status(200).json({
                success: true,
                data: ticket,
                message: 'Ticket updated successfully'
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
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                const result = await client.ticket.updateMany({
                    where: {
                        id: { in: ticketIds },
                        tenantId: req.tenantId,
                    },
                    data: {
                        status,
                        updatedAt: new Date()
                    }
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
            const stats = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                const ticketStats = await client.ticket.groupBy({
                    by: ['status'],
                    where: {
                        projectId,
                        tenantId: req.tenantId,
                    },
                    _count: true,
                });
                const totalTickets = await client.ticket.count({
                    where: { projectId, tenantId: req.tenantId }
                });
                return {
                    projectId,
                    totalTickets,
                    stats: ticketStats
                };
            });
            res.status(200).json({
                success: true,
                data: stats
            });
        }
        catch (error) {
            console.error('Get ticket stats by project error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch ticket statistics'
            });
        }
    }
    /**
     * Get workflow steps for a ticket (tenant-aware)
     */
    static async getWorkflowSteps(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const workflowSteps = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Verify ticket exists and belongs to tenant
                const ticket = await client.ticket.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!ticket) {
                    throw new types_1.NotFoundError('Ticket not found');
                }
                return await client.ticketWorkflowStep.findMany({
                    where: {
                        ticketId: id,
                        tenantId: req.tenantId,
                    },
                    orderBy: { createdAt: 'asc' },
                });
            });
            res.status(200).json({
                success: true,
                data: workflowSteps,
            });
        }
        catch (error) {
            console.error('Get workflow steps error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to fetch workflow steps',
            });
        }
    }
    /**
     * Update workflow step (tenant-aware)
     */
    static async updateWorkflowStep(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const { stepName, updates } = req.body;
            if (!stepName || !updates) {
                res.status(400).json({
                    success: false,
                    error: 'Step name and updates are required',
                });
                return;
            }
            const result = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Verify ticket exists and belongs to tenant
                const ticket = await client.ticket.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    },
                });
                if (!ticket) {
                    throw new types_1.NotFoundError('Ticket not found');
                }
                // Find or create workflow step
                let workflowStep = await client.ticketWorkflowStep.findFirst({
                    where: {
                        ticketId: id,
                        stepName,
                        tenantId: req.tenantId,
                    },
                });
                if (!workflowStep) {
                    // Create new workflow step
                    workflowStep = await client.ticketWorkflowStep.create({
                        data: {
                            ticketId: id,
                            tenantId: req.tenantId,
                            stepName,
                            status: updates.status || 'not_started',
                            assignedTo: updates.assignedTo || [],
                            approvers: updates.approvers || [],
                            approvalStatus: updates.approvalStatus || [],
                            documents: updates.documents || [],
                            notes: updates.notes,
                            startDate: updates.startDate ? new Date(updates.startDate) : null,
                            endDate: updates.endDate ? new Date(updates.endDate) : null,
                            completedAt: updates.status === 'completed' ? new Date() : null,
                            scheduledMeeting: updates.scheduledMeeting || null,
                            branchName: updates.branchName,
                            testResults: updates.testResults || [],
                        },
                    });
                }
                else {
                    // Update existing workflow step
                    workflowStep = await client.ticketWorkflowStep.update({
                        where: { id: workflowStep.id },
                        data: {
                            ...updates,
                            completedAt: updates.status === 'completed' ? new Date() : workflowStep.completedAt,
                            updatedAt: new Date(),
                        },
                    });
                }
                // Log activity
                await client.ticketActivityLog.create({
                    data: {
                        ticketId: id,
                        tenantId: req.tenantId,
                        action: `Workflow Step Updated: ${stepName}`,
                        performedById: req.user.id,
                        details: updates,
                    },
                });
                // Update ticket's current workflow step if needed
                if (updates.status === 'completed') {
                    await client.ticket.update({
                        where: { id },
                        data: {
                            currentWorkflowStep: stepName,
                            updatedAt: new Date(),
                        },
                    });
                }
                return workflowStep;
            });
            res.status(200).json({
                success: true,
                data: result,
                message: 'Workflow step updated successfully',
            });
        }
        catch (error) {
            console.error('Update workflow step error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to update workflow step',
            });
        }
    }
    /**
     * Get comments for a ticket (tenant-aware)
     */
    static async getComments(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const comments = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Verify ticket exists and belongs to tenant
                const ticket = await client.ticket.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!ticket) {
                    throw new types_1.NotFoundError('Ticket not found');
                }
                return await client.ticketComment.findMany({
                    where: {
                        ticketId: id,
                        tenantId: req.tenantId,
                    },
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                workEmail: true,
                                position: true,
                            }
                        }
                    },
                    orderBy: { timestamp: 'asc' },
                });
            });
            res.status(200).json({
                success: true,
                data: comments,
            });
        }
        catch (error) {
            console.error('Get comments error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to fetch comments',
            });
        }
    }
    /**
     * Add comment to ticket (tenant-aware)
     */
    static async addComment(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const { comment, attachments = [] } = req.body;
            if (!comment || comment.trim() === '') {
                res.status(400).json({
                    success: false,
                    error: 'Comment text is required',
                });
                return;
            }
            const result = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Verify ticket exists and belongs to tenant
                const ticket = await client.ticket.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!ticket) {
                    throw new types_1.NotFoundError('Ticket not found');
                }
                // Create comment
                const newComment = await client.ticketComment.create({
                    data: {
                        ticketId: id,
                        tenantId: req.tenantId,
                        userId: req.user.id,
                        comment: comment.trim(),
                        attachments,
                    },
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                workEmail: true,
                                position: true,
                            }
                        }
                    },
                });
                // Log activity
                await client.ticketActivityLog.create({
                    data: {
                        ticketId: id,
                        tenantId: req.tenantId,
                        action: 'Comment Added',
                        performedById: req.user.id,
                        details: { comment },
                    },
                });
                return newComment;
            });
            res.status(201).json({
                success: true,
                data: result,
                message: 'Comment added successfully',
            });
        }
        catch (error) {
            console.error('Add comment error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to add comment',
            });
        }
    }
    /**
     * Update comment (tenant-aware)
     */
    static async updateComment(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { ticketId, commentId } = req.params;
            const { comment } = req.body;
            if (!comment || comment.trim() === '') {
                res.status(400).json({
                    success: false,
                    error: 'Comment text is required',
                });
                return;
            }
            const result = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Verify ticket exists and belongs to tenant
                const ticket = await client.ticket.findFirst({
                    where: {
                        id: ticketId,
                        tenantId: req.tenantId,
                    }
                });
                if (!ticket) {
                    throw new types_1.NotFoundError('Ticket not found');
                }
                // Verify comment exists and belongs to this user
                const existingComment = await client.ticketComment.findFirst({
                    where: {
                        id: commentId,
                        ticketId,
                        tenantId: req.tenantId,
                        userId: req.user.id, // Only owner can update
                    }
                });
                if (!existingComment) {
                    throw new types_1.NotFoundError('Comment not found or you do not have permission to edit it');
                }
                // Update comment
                const updatedComment = await client.ticketComment.update({
                    where: { id: commentId },
                    data: {
                        comment: comment.trim(),
                        updatedAt: new Date(),
                    },
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                workEmail: true,
                                position: true,
                            }
                        }
                    },
                });
                // Log activity
                await client.ticketActivityLog.create({
                    data: {
                        ticketId,
                        tenantId: req.tenantId,
                        action: 'Comment Updated',
                        performedById: req.user.id,
                        details: { commentId },
                    },
                });
                return updatedComment;
            });
            res.status(200).json({
                success: true,
                data: result,
                message: 'Comment updated successfully',
            });
        }
        catch (error) {
            console.error('Update comment error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to update comment',
            });
        }
    }
    /**
     * Delete comment (tenant-aware)
     */
    static async deleteComment(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { ticketId, commentId } = req.params;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Verify ticket exists and belongs to tenant
                const ticket = await client.ticket.findFirst({
                    where: {
                        id: ticketId,
                        tenantId: req.tenantId,
                    }
                });
                if (!ticket) {
                    throw new types_1.NotFoundError('Ticket not found');
                }
                // Verify comment exists and belongs to this user
                const existingComment = await client.ticketComment.findFirst({
                    where: {
                        id: commentId,
                        ticketId,
                        tenantId: req.tenantId,
                        userId: req.user.id, // Only owner can delete
                    }
                });
                if (!existingComment) {
                    throw new types_1.NotFoundError('Comment not found or you do not have permission to delete it');
                }
                // Delete comment
                await client.ticketComment.delete({
                    where: { id: commentId }
                });
                // Log activity
                await client.ticketActivityLog.create({
                    data: {
                        ticketId,
                        tenantId: req.tenantId,
                        action: 'Comment Deleted',
                        performedById: req.user.id,
                        details: { commentId, comment: existingComment.comment },
                    },
                });
            });
            res.status(200).json({
                success: true,
                message: 'Comment deleted successfully',
            });
        }
        catch (error) {
            console.error('Delete comment error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to delete comment',
            });
        }
    }
    /**
     * Get related links for ticket (tenant-aware)
     */
    static async getRelatedLinks(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const relatedLinks = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Verify ticket exists and belongs to tenant
                const ticket = await client.ticket.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!ticket) {
                    throw new types_1.NotFoundError('Ticket not found');
                }
                return await client.ticketRelatedLink.findMany({
                    where: {
                        ticketId: id,
                        tenantId: req.tenantId,
                    },
                    include: {
                        addedBy: {
                            select: {
                                id: true,
                                name: true,
                                workEmail: true,
                                position: true,
                            }
                        }
                    },
                    orderBy: { addedAt: 'desc' },
                });
            });
            res.status(200).json({
                success: true,
                data: relatedLinks,
            });
        }
        catch (error) {
            console.error('Get related links error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to fetch related links',
            });
        }
    }
    /**
     * Add related link to ticket (tenant-aware)
     */
    static async addRelatedLink(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const { linkType, title, description, url } = req.body;
            if (!linkType || !title || !description || !url) {
                res.status(400).json({
                    success: false,
                    error: 'Link type, title, description, and URL are required',
                });
                return;
            }
            const result = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Verify ticket exists and belongs to tenant
                const ticket = await client.ticket.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!ticket) {
                    throw new types_1.NotFoundError('Ticket not found');
                }
                // Create related link
                const newLink = await client.ticketRelatedLink.create({
                    data: {
                        ticketId: id,
                        tenantId: req.tenantId,
                        linkType,
                        title,
                        description,
                        url,
                        addedById: req.user.id,
                    },
                    include: {
                        addedBy: {
                            select: {
                                id: true,
                                name: true,
                                workEmail: true,
                                position: true,
                            }
                        }
                    },
                });
                // Log activity
                await client.ticketActivityLog.create({
                    data: {
                        ticketId: id,
                        tenantId: req.tenantId,
                        action: 'Related Link Added',
                        performedById: req.user.id,
                        details: { linkType, title, url },
                    },
                });
                return newLink;
            });
            res.status(201).json({
                success: true,
                data: result,
                message: 'Related link added successfully',
            });
        }
        catch (error) {
            console.error('Add related link error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to add related link',
            });
        }
    }
    /**
     * Update related link (tenant-aware)
     */
    static async updateRelatedLink(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { ticketId, linkId } = req.params;
            const { title, description, url } = req.body;
            const result = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Verify ticket exists and belongs to tenant
                const ticket = await client.ticket.findFirst({
                    where: {
                        id: ticketId,
                        tenantId: req.tenantId,
                    }
                });
                if (!ticket) {
                    throw new types_1.NotFoundError('Ticket not found');
                }
                // Verify related link exists and belongs to this ticket and tenant
                const existingLink = await client.ticketRelatedLink.findFirst({
                    where: {
                        id: linkId,
                        ticketId,
                        tenantId: req.tenantId,
                    }
                });
                if (!existingLink) {
                    throw new types_1.NotFoundError('Related link not found');
                }
                // Update related link
                const updatedLink = await client.ticketRelatedLink.update({
                    where: { id: linkId },
                    data: {
                        title: title || existingLink.title,
                        description: description || existingLink.description,
                        url: url || existingLink.url,
                        updatedAt: new Date(),
                    },
                    include: {
                        addedBy: {
                            select: {
                                id: true,
                                name: true,
                                workEmail: true,
                                position: true,
                            }
                        }
                    },
                });
                // Log activity
                await client.ticketActivityLog.create({
                    data: {
                        ticketId,
                        tenantId: req.tenantId,
                        action: 'Related Link Updated',
                        performedById: req.user.id,
                        details: { linkId, title, description, url },
                    },
                });
                return updatedLink;
            });
            res.status(200).json({
                success: true,
                data: result,
                message: 'Related link updated successfully',
            });
        }
        catch (error) {
            console.error('Update related link error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to update related link',
            });
        }
    }
    /**
     * Delete related link (tenant-aware)
     */
    static async deleteRelatedLink(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { ticketId, linkId } = req.params;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Verify ticket exists and belongs to tenant
                const ticket = await client.ticket.findFirst({
                    where: {
                        id: ticketId,
                        tenantId: req.tenantId,
                    }
                });
                if (!ticket) {
                    throw new types_1.NotFoundError('Ticket not found');
                }
                // Verify related link exists and belongs to this ticket and tenant
                const existingLink = await client.ticketRelatedLink.findFirst({
                    where: {
                        id: linkId,
                        ticketId,
                        tenantId: req.tenantId,
                    }
                });
                if (!existingLink) {
                    throw new types_1.NotFoundError('Related link not found');
                }
                // Delete related link
                await client.ticketRelatedLink.delete({
                    where: { id: linkId }
                });
                // Log activity
                await client.ticketActivityLog.create({
                    data: {
                        ticketId,
                        tenantId: req.tenantId,
                        action: 'Related Link Deleted',
                        performedById: req.user.id,
                        details: { linkId, title: existingLink.title },
                    },
                });
            });
            res.status(200).json({
                success: true,
                message: 'Related link deleted successfully',
            });
        }
        catch (error) {
            console.error('Delete related link error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to delete related link',
            });
        }
    }
    /**
     * Get activity log for a ticket (tenant-aware)
     */
    static async getActivityLog(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const activityLog = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Verify ticket exists and belongs to tenant
                const ticket = await client.ticket.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!ticket) {
                    throw new types_1.NotFoundError('Ticket not found');
                }
                return await client.ticketActivityLog.findMany({
                    where: {
                        ticketId: id,
                        tenantId: req.tenantId,
                    },
                    include: {
                        performedBy: {
                            select: {
                                id: true,
                                name: true,
                                workEmail: true,
                                position: true,
                            }
                        }
                    },
                    orderBy: { timestamp: 'desc' },
                });
            });
            res.status(200).json({
                success: true,
                data: activityLog,
            });
        }
        catch (error) {
            console.error('Get activity log error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to fetch activity log',
            });
        }
    }
}
exports.TicketController = TicketController;
//# sourceMappingURL=ticketController.js.map