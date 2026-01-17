"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TicketController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
const r2Client_1 = require("@/utils/r2Client");
const htmlSanitizer_1 = require("@/utils/htmlSanitizer");
const socketService_1 = require("@/services/socketService");
const cacheService_1 = __importDefault(require("@/utils/cacheService"));
class TicketController {
    /**
     * Upload image to R2 for ticket description
     */
    static async uploadImage(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { image, ticketId } = req.body;
            if (!image) {
                res.status(400).json({
                    success: false,
                    error: "Image data is required",
                });
                return;
            }
            // Upload image to R2
            const imageUrl = await (0, r2Client_1.uploadImageToR2)(image, req.tenantId, ticketId);
            res.status(200).json({
                success: true,
                data: { url: imageUrl },
                message: "Image uploaded successfully",
            });
        }
        catch (error) {
            console.error("Upload image error:", error);
            res.status(500).json({
                success: false,
                error: error.message || "Failed to upload image",
            });
        }
    }
    /**
     * Get dashboard statistics (tenant-aware)
     */
    static async getDashboardStats(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const currentDate = new Date();
            const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            // General statistics
            const generalStats = await database_1.prisma.ticket.groupBy({
                by: ["status"],
                where: {
                    tenantId: req.tenantId,
                    createdAt: { gte: startOfMonth, lte: endOfMonth },
                },
                _count: true,
            });
            const totalTickets = generalStats.reduce((sum, stat) => sum + stat._count, 0);
            const statusCounts = {
                total: totalTickets,
                in_progress: generalStats.find((s) => s.status === "IN_PROGRESS")?._count || 0,
                not_started: generalStats.find((s) => s.status === "NOT_STARTED")?._count || 0,
                completed: generalStats.find((s) => s.status === "COMPLETED")?._count || 0,
                blocked: generalStats.find((s) => s.status === "BLOCKED")?._count || 0,
            };
            const stats = {
                generalStats: statusCounts,
                period: {
                    start: startOfMonth,
                    end: endOfMonth,
                    month: currentDate.toLocaleString("default", {
                        month: "long",
                        year: "numeric",
                    }),
                },
            };
            res.status(200).json({
                success: true,
                data: stats,
            });
        }
        catch (error) {
            console.error("Get dashboard stats error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch dashboard statistics",
            });
        }
    }
    /**
     * Create a new ticket (tenant-aware)
     */
    static async createTicket(req, res) {
        try {
            console.log('createTicket body:', JSON.stringify(req.body, null, 2));
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            // Extract and map fields from request body
            const { title, description, status = "NOT_STARTED", priority = "MEDIUM", type = "TASK", dueDate, tags = [], platform, stack, taskLevel, taskType, storyPoint, estimateHours, parentTickets = [], parentId, releasePlan, } = req.body;
            // Map frontend field names to backend field names
            const projectId = req.body.project || req.body.projectId;
            const assigneeId = req.body.assignee || req.body.assigneeId;
            const reportToId = req.body.reportTo || req.body.reportToId;
            // Map taskType to type for database (frontend sends taskType, backend stores as type)
            const ticketType = taskType || type || "TASK";
            // Validate required fields
            if (!title || !projectId) {
                res.status(400).json({
                    success: false,
                    error: "Title and project are required",
                });
                return;
            }
            // Sanitize and validate description if provided
            let sanitizedDescription = "";
            if (description) {
                try {
                    (0, htmlSanitizer_1.validateHtmlLength)(description);
                    sanitizedDescription = (0, htmlSanitizer_1.sanitizeHtmlContent)(description);
                }
                catch (error) {
                    res.status(400).json({
                        success: false,
                        error: error.message || "Invalid description content",
                    });
                    return;
                }
            }
            // Validate project exists and belongs to tenant
            const project = await database_1.prisma.project.findFirst({
                where: {
                    id: projectId,
                    tenantId: req.tenantId,
                },
            });
            if (!project) {
                throw new types_1.ValidationError("Project not found in this tenant");
            }
            // Validate assignee if provided
            if (assigneeId) {
                const assignee = await database_1.prisma.user.findFirst({
                    where: {
                        id: assigneeId,
                        tenantId: req.tenantId,
                        isActive: true,
                    },
                });
                if (!assignee) {
                    throw new types_1.ValidationError("Assignee not found in this tenant");
                }
            }
            // Validate reportTo if provided
            if (reportToId) {
                const reportTo = await database_1.prisma.user.findFirst({
                    where: {
                        id: reportToId,
                        tenantId: req.tenantId,
                        isActive: true,
                    },
                });
                if (!reportTo) {
                    throw new types_1.ValidationError("Report To user not found in this tenant");
                }
            }
            // Validate parentId - prevent nested subtasks
            if (parentId) {
                const parentTicket = await database_1.prisma.ticket.findFirst({
                    where: {
                        id: parentId,
                        tenantId: req.tenantId,
                    },
                    select: {
                        id: true,
                        parentId: true,
                        ticketNumber: true,
                    },
                });
                if (!parentTicket) {
                    throw new types_1.ValidationError("Parent ticket not found in this tenant");
                }
                // Prevent nested subtasks - parent cannot be a subtask itself
                if (parentTicket.parentId) {
                    throw new types_1.ValidationError(`Cannot create subtask of a subtask. Ticket ${parentTicket.ticketNumber} is already a subtask.`);
                }
            }
            // Generate ticket number
            // Generate ticket number safely by finding the last created ticket
            const lastTicket = await database_1.prisma.ticket.findFirst({
                where: { tenantId: req.tenantId },
                orderBy: { createdAt: 'desc' } // Get the most recently created ticket
            });
            let nextTicketNumber = 1;
            if (lastTicket && lastTicket.ticketNumber) {
                // Extract the number part from the last ticket (e.g., "PROJ-0005" -> 5)
                const parts = lastTicket.ticketNumber.split('-');
                const lastSeq = parseInt(parts[parts.length - 1]);
                if (!isNaN(lastSeq)) {
                    nextTicketNumber = lastSeq + 1;
                }
            }
            const ticketNumber = `${project.code || "TKT"}-${nextTicketNumber
                .toString()
                .padStart(4, "0")}`;
            // Prepare metadata for additional fields not in schema
            const metadata = {
                parentTickets,
                releasePlan,
            };
            // Create ticket with fields at root level (matching Prisma schema)
            const ticket = await database_1.prisma.ticket.create({
                data: {
                    tenantId: req.tenantId,
                    title,
                    description: sanitizedDescription,
                    projectId,
                    status,
                    priority,
                    type: ticketType,
                    platform: platform || "Development",
                    stack: stack || null,
                    taskLevel: taskLevel || "Medium",
                    storyPoint: storyPoint || 1,
                    estimateHours: estimateHours || 0,
                    assigneeId: assigneeId || null,
                    reportToId: reportToId || null,
                    createdById: req.user.id,
                    parentTickets: parentTickets || [],
                    parentId: parentId || null,
                    startDate: req.body.startDate ? new Date(req.body.startDate) : null,
                    endDate: req.body.endDate ? new Date(req.body.endDate) : null,
                    dueDate: dueDate ? new Date(dueDate) : null,
                    tags,
                    metadata,
                    ticketNumber,
                },
                include: {
                    createdBy: {
                        select: { id: true, name: true, workEmail: true, position: true },
                    },
                    assignee: {
                        select: { id: true, name: true, workEmail: true, position: true },
                    },
                    reportTo: {
                        select: { id: true, name: true, workEmail: true, position: true },
                    },
                    project: {
                        select: { id: true, name: true, code: true, description: true },
                    },
                },
            });
            socketService_1.socketService.emitToTenant(req.tenantId, "ticket:created", ticket);
            if (parentId) {
                await cacheService_1.default.invalidateTicket(parentId, req.tenantId);
            }
            res.status(201).json({
                success: true,
                data: ticket,
                message: "Ticket created successfully",
            });
        }
        catch (error) {
            console.error("Create ticket error:", error);
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to create ticket",
            });
        }
    }
    /**
     * Get tickets optimized for Kanban view (tenant-aware)
     * Returns tickets grouped by status with metadata
     */
    static async getKanbanTickets(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { projectId, assigneeId, priority, search, limitPerColumn = 50, includeArchived = false, } = req.query;
            // Build base filter
            const baseWhere = {
                tenantId: req.tenantId,
                parentId: null, // Exclude subtasks from main board
                isArchived: includeArchived === 'true' ? undefined : false, // Exclude archived tickets by default
            };
            if (projectId)
                baseWhere.projectId = projectId;
            if (priority)
                baseWhere.priority = priority;
            if (assigneeId) {
                if (typeof assigneeId === "string" && assigneeId.includes(",")) {
                    baseWhere.assigneeId = { in: assigneeId.split(",").map((id) => id.trim()) };
                }
                else {
                    baseWhere.assigneeId = assigneeId;
                }
            }
            if (search) {
                baseWhere.OR = [
                    { title: { contains: search, mode: "insensitive" } },
                    { ticketNumber: { contains: search, mode: "insensitive" } },
                ];
            }
            // Handle releasePlanId, sprintId, demoId filtering
            const { releasePlanId, sprintId, demoId } = req.query;
            if (releasePlanId) {
                if (releasePlanId === 'null')
                    baseWhere.releasePlanId = null;
                else
                    baseWhere.releasePlanId = releasePlanId;
            }
            if (demoId) {
                if (demoId === 'null')
                    baseWhere.demoPlanId = null;
                else
                    baseWhere.demoPlanId = demoId;
            }
            if (sprintId) {
                if (sprintId === 'null') {
                    baseWhere.sprintPlanId = null;
                }
                else if (sprintId === 'active') {
                    const activeSprintWhere = {
                        type: 'sprint_plan',
                        status: 'active',
                        tenantId: req.tenantId
                    };
                    if (projectId)
                        activeSprintWhere.projectId = projectId;
                    const activeSprints = await database_1.prisma.releasePlan.findMany({
                        where: activeSprintWhere,
                        select: { id: true }
                    });
                    if (activeSprints.length > 0) {
                        baseWhere.sprintPlanId = { in: activeSprints.map((s) => s.id) };
                    }
                    else {
                        baseWhere.sprintPlanId = { in: [] };
                    }
                }
                else {
                    baseWhere.sprintPlanId = sprintId;
                }
            }
            const statuses = ['not_started', 'in_progress', 'in_testing', 'completed'];
            const limit = Number(limitPerColumn);
            // Fetch tickets for each status in parallel
            const columnsData = await Promise.all(statuses.map(async (status) => {
                const where = { ...baseWhere, status };
                const [tickets, total] = await Promise.all([
                    database_1.prisma.ticket.findMany({
                        where,
                        take: limit,
                        orderBy: [
                            { priority: 'asc' },
                            { createdAt: 'desc' }
                        ],
                        select: {
                            id: true,
                            ticketNumber: true,
                            title: true,
                            status: true,
                            priority: true,
                            type: true,
                            storyPoint: true,
                            assignee: {
                                select: {
                                    id: true,
                                    name: true,
                                    workEmail: true
                                }
                            },
                            project: {
                                select: {
                                    id: true,
                                    name: true,
                                    code: true
                                }
                            },
                            createdAt: true,
                            updatedAt: true,
                        },
                    }),
                    database_1.prisma.ticket.count({ where }),
                ]);
                return {
                    status,
                    tickets,
                    total,
                    hasMore: total > limit,
                    loaded: tickets.length,
                };
            }));
            // Transform to object for easier frontend consumption
            const columns = columnsData.reduce((acc, col) => {
                acc[col.status] = col;
                return acc;
            }, {});
            const totalTickets = columnsData.reduce((sum, col) => sum + col.total, 0);
            res.status(200).json({
                success: true,
                data: {
                    columns,
                    summary: {
                        total: totalTickets,
                        loaded: columnsData.reduce((sum, col) => sum + col.loaded, 0),
                    },
                },
            });
        }
        catch (error) {
            console.error("Get Kanban tickets error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch Kanban tickets",
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
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { page = 1, limit = 20, status, priority, projectId, assigneeId, createdById, search, sortBy = "createdAt", sortOrder = "desc", startDate, endDate, includeArchived = false, } = req.query;
            // Build base filter
            const baseWhere = {
                tenantId: req.tenantId,
                parentId: null, // Exclude subtasks from main board
                isArchived: includeArchived === 'true' ? undefined : false, // Exclude archived tickets by default
            };
            const where = { ...baseWhere };
            if (status)
                where.status = status;
            if (priority)
                where.priority = priority;
            if (projectId)
                where.projectId = projectId;
            // Handle single or multiple assignees
            if (assigneeId) {
                if (typeof assigneeId === "string" && assigneeId.includes(",")) {
                    // Multiple assignees - split and use 'in' operator
                    where.assigneeId = {
                        in: assigneeId.split(",").map((id) => id.trim()),
                    };
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
                    { title: { contains: search, mode: "insensitive" } },
                    { description: { contains: search, mode: "insensitive" } },
                    { ticketNumber: { contains: search, mode: "insensitive" } },
                ];
            }
            // Handle releasePlanId, sprintId, demoId filtering
            const { releasePlanId, sprintId, demoId } = req.query;
            if (releasePlanId) {
                if (releasePlanId === 'null')
                    where.releasePlanId = null;
                else
                    where.releasePlanId = releasePlanId;
            }
            if (demoId) {
                if (demoId === 'null')
                    where.demoPlanId = null;
                else
                    where.demoPlanId = demoId;
            }
            if (sprintId) {
                if (sprintId === 'null') {
                    where.sprintPlanId = null;
                }
                else if (sprintId === 'active') {
                    const activeSprintWhere = {
                        type: 'sprint_plan',
                        status: 'active',
                        tenantId: req.tenantId
                    };
                    if (projectId)
                        activeSprintWhere.projectId = projectId;
                    const activeSprints = await database_1.prisma.releasePlan.findMany({
                        where: activeSprintWhere,
                        select: { id: true }
                    });
                    if (activeSprints.length > 0) {
                        where.sprintPlanId = { in: activeSprints.map((s) => s.id) };
                    }
                    else {
                        where.sprintPlanId = { in: [] };
                    }
                }
                else {
                    where.sprintPlanId = sprintId;
                }
            }
            // Build sort object
            const orderBy = {};
            orderBy[sortBy] = sortOrder === "desc" ? "desc" : "asc";
            // Execute query with pagination
            const skip = (Number(page) - 1) * Number(limit);
            // OPTIMIZED: Fixed Promise.all syntax + Reduced data fetching
            const [tickets, total] = await Promise.all([
                database_1.prisma.ticket.findMany({
                    where,
                    select: {
                        id: true,
                        ticketNumber: true,
                        title: true,
                        status: true,
                        priority: true,
                        type: true,
                        platform: true,
                        taskLevel: true,
                        storyPoint: true,
                        dueDate: true,
                        createdAt: true,
                        updatedAt: true,
                        // Exclude large fields: description (can be fetched in detail view)
                        createdBy: {
                            select: { id: true, name: true, workEmail: true },
                        },
                        assignee: {
                            select: { id: true, name: true, workEmail: true },
                        },
                        project: {
                            select: { id: true, name: true, code: true },
                        },
                        // Removed reportTo to reduce joins (add back if needed)
                    },
                    orderBy,
                    skip,
                    take: Number(limit),
                }),
                database_1.prisma.ticket.count({ where }),
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
                    hasPrev: Number(page) > 1,
                },
            });
        }
        catch (error) {
            console.error("Get tickets error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch tickets",
            });
        }
    }
    /**
     * Get ticket by ID with full details (tenant-aware)
     * OPTIMIZED: Redis caching + removed comments/links (fetched separately)
     */
    static async getTicketById(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            // Check cache first
            const cached = await cacheService_1.default.getTicket(id, req.tenantId);
            if (cached) {
                res.status(200).json({
                    success: true,
                    data: cached,
                });
                return;
            }
            // OPTIMIZED: Removed comments and relatedLinks (fetched separately)
            const ticket = await database_1.prisma.ticket.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                },
                select: {
                    // All ticket fields
                    id: true,
                    ticketNumber: true,
                    title: true,
                    description: true,
                    status: true,
                    priority: true,
                    type: true,
                    platform: true,
                    stack: true,
                    taskLevel: true,
                    storyPoint: true,
                    estimateHours: true,
                    startDate: true,
                    endDate: true,
                    dueDate: true,
                    currentWorkflowStep: true,
                    tags: true,
                    metadata: true,
                    parentTickets: true,
                    parentId: true, // IMPORTANT: Include parentId for subtask navigation
                    createdAt: true,
                    updatedAt: true,
                    // Optimized relations - only essential fields
                    createdBy: {
                        select: { id: true, name: true, workEmail: true },
                    },
                    assignee: {
                        select: { id: true, name: true, workEmail: true },
                    },
                    reportTo: {
                        select: { id: true, name: true, position: true },
                    },
                    project: {
                        select: { id: true, name: true, code: true, description: true },
                        // Removed: projectManager (not needed in detail view)
                    },
                    // Include subtasks for the UI
                    subTasks: {
                        select: {
                            id: true,
                            ticketNumber: true,
                            title: true,
                            status: true,
                            priority: true,
                            assignee: {
                                select: { id: true, name: true, workEmail: true }
                            },
                            type: true
                        },
                        orderBy: { createdAt: 'asc' }
                    }
                    // Comments and relatedLinks removed - fetch separately via:
                    // GET /api/tickets/:id/comments
                    // GET /api/tickets/:id/links
                },
            });
            if (!ticket) {
                res.status(404).json({
                    success: false,
                    error: "Ticket not found",
                });
                return;
            }
            // Cache for 2 minutes
            await cacheService_1.default.cacheTicket(id, req.tenantId, ticket);
            res.status(200).json({
                success: true,
                data: ticket,
            });
        }
        catch (error) {
            console.error("Get ticket by ID error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch ticket",
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
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const updates = req.body;
            // Map frontend field names to backend field names (like in createTicket)
            const mappedUpdates = { ...updates };
            // Map field names
            if (updates.project) {
                mappedUpdates.projectId = updates.project;
                delete mappedUpdates.project;
            }
            if (updates.assignee !== undefined) {
                console.log('Update Assignee Debug:', { val: updates.assignee, type: typeof updates.assignee, isNull: updates.assignee === null });
                // Handle explicit null or empty string as unassigning
                mappedUpdates.assigneeId = (updates.assignee === '' || updates.assignee === null) ? null : updates.assignee;
                delete mappedUpdates.assignee;
            }
            if (updates.reportTo) {
                mappedUpdates.reportToId = updates.reportTo;
                delete mappedUpdates.reportTo;
            }
            // Map taskType to type (frontend sends taskType, backend stores as type)
            if (updates.taskType) {
                mappedUpdates.type = updates.taskType;
                delete mappedUpdates.taskType;
            }
            // Handle releasePlan / sprint assignment smart mapping
            if (updates.releasePlan !== undefined) {
                const planId = updates.releasePlan;
                if (planId === null) {
                    // If null, we might be unassigning. 
                    // Ideally we should know WHICH plan to unassign, but legacy behavior implies releasePlanId.
                    // For Sprint assignment, frontend might send null to remove from sprint.
                    // We'll check if we can clarify, but for now let's assume if it's explicitly null, 
                    // we clear sprintPlanId if it was a sprint action, or we clear them all?
                    // Safer to just clear sprintPlanId if the intention was sprint?
                    // But let's look at TicketList. It supports Sprint Assignment.
                    // If we can't accept explicit fields, we default to clearing sprintPlanId 
                    // if the user is in Kanban active/backlog mode?
                    // Actually, let's just support direct field updates from frontend if possible, 
                    // but `updateTicketMutation` in frontend is generic.
                    // For now, let's clear sprintPlanId as that's the most common "remove" action in the new UI.
                    mappedUpdates.sprintPlanId = null;
                }
                else if (typeof planId === 'string') {
                    const plan = await database_1.prisma.releasePlan.findUnique({ where: { id: planId } });
                    if (plan) {
                        if (plan.type === 'sprint_plan') {
                            mappedUpdates.sprintPlanId = planId;
                        }
                        else if (plan.type === 'demo_plan') {
                            mappedUpdates.demoPlanId = planId;
                        }
                        else {
                            mappedUpdates.releasePlanId = planId;
                        }
                    }
                }
                delete mappedUpdates.releasePlan;
            }
            // Handle date conversions
            if (mappedUpdates.startDate &&
                typeof mappedUpdates.startDate === "string") {
                mappedUpdates.startDate = new Date(mappedUpdates.startDate);
            }
            if (mappedUpdates.endDate && typeof mappedUpdates.endDate === "string") {
                mappedUpdates.endDate = new Date(mappedUpdates.endDate);
            }
            // Verify ticket exists and belongs to tenant
            const existingTicket = await database_1.prisma.ticket.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                },
            });
            if (!existingTicket) {
                throw new types_1.NotFoundError("Ticket not found in this tenant");
            }
            // Validate parentId if being updated - prevent nested subtasks
            if (mappedUpdates.parentId !== undefined && mappedUpdates.parentId !== null) {
                const newParentTicket = await database_1.prisma.ticket.findFirst({
                    where: {
                        id: mappedUpdates.parentId,
                        tenantId: req.tenantId,
                    },
                    select: {
                        id: true,
                        parentId: true,
                        ticketNumber: true,
                    },
                });
                if (!newParentTicket) {
                    throw new types_1.ValidationError("Parent ticket not found in this tenant");
                }
                // Prevent nested subtasks - new parent cannot be a subtask itself
                if (newParentTicket.parentId) {
                    throw new types_1.ValidationError(`Cannot set parent to a subtask. Ticket ${newParentTicket.ticketNumber} is already a subtask.`);
                }
                // Prevent setting a ticket's own subtask as its parent (circular reference)
                if (newParentTicket.id === id) {
                    throw new types_1.ValidationError("A ticket cannot be its own parent");
                }
            }
            // Sanitize description if it's being updated
            if (mappedUpdates.description) {
                try {
                    (0, htmlSanitizer_1.validateHtmlLength)(mappedUpdates.description);
                    mappedUpdates.description = (0, htmlSanitizer_1.sanitizeHtmlContent)(mappedUpdates.description);
                    // Clean up orphaned images if description changed
                    if (existingTicket.description) {
                        await (0, r2Client_1.cleanupOrphanedImages)(existingTicket.description, mappedUpdates.description, req.tenantId);
                    }
                }
                catch (error) {
                    throw new types_1.ValidationError(error.message || "Invalid description content");
                }
            }
            // Actually update the ticket in database
            const ticket = await database_1.prisma.ticket.update({
                where: { id },
                data: {
                    ...mappedUpdates,
                    updatedAt: new Date(),
                },
                include: {
                    createdBy: { select: { id: true, name: true, workEmail: true } },
                    assignee: { select: { id: true, name: true, workEmail: true } },
                    project: { select: { id: true, name: true, code: true } },
                },
            });
            // Side effects (Cache & Socket)
            try {
                socketService_1.socketService.emitToTenant(req.tenantId, "ticket:updated", ticket);
                const promises = [
                    cacheService_1.default.invalidateTicket(id, req.tenantId)
                ];
                // Invalidate parent if it exists (either from before or new)
                const parentIdToInvalidate = ticket.parentId || existingTicket.parentId;
                if (parentIdToInvalidate) {
                    promises.push(cacheService_1.default.invalidateTicket(parentIdToInvalidate, req.tenantId));
                }
                await Promise.allSettled(promises);
            }
            catch (sideEffectError) {
                console.error("Update ticket side-effect error (non-fatal):", sideEffectError);
            }
            res.status(200).json({
                success: true,
                data: ticket,
                message: "Ticket updated successfully",
            });
        }
        catch (error) {
            console.error("Update ticket error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to update ticket",
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
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const ticket = await database_1.prisma.ticket.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                },
            });
            if (!ticket) {
                throw new types_1.NotFoundError("Ticket not found in this tenant");
            }
            await database_1.prisma.ticket.delete({
                where: { id },
            });
            socketService_1.socketService.emitToTenant(req.tenantId, "ticket:deleted", { id });
            const invalidationPromises = [
                cacheService_1.default.invalidateTicket(id, req.tenantId)
            ];
            if (ticket.parentId) {
                invalidationPromises.push(cacheService_1.default.invalidateTicket(ticket.parentId, req.tenantId));
            }
            await Promise.allSettled(invalidationPromises);
            res.status(200).json({
                success: true,
                message: "Ticket deleted successfully",
            });
        }
        catch (error) {
            console.error("Delete ticket error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to delete ticket",
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
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { page = 1, limit = 20, status, priority } = req.query;
            const where = {
                tenantId: req.tenantId,
                assigneeId: req.user.id,
            };
            if (status)
                where.status = status;
            if (priority)
                where.priority = priority;
            const skip = (Number(page) - 1) * Number(limit);
            const [tickets, total] = await Promise.all([
                await database_1.prisma.ticket.findMany({
                    where,
                    include: {
                        createdBy: { select: { name: true, workEmail: true } },
                        project: { select: { name: true, code: true } },
                    },
                    orderBy: { createdAt: "desc" },
                    skip,
                    take: Number(limit),
                }),
                await database_1.prisma.ticket.count({ where }),
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
                    hasPrev: Number(page) > 1,
                },
            });
        }
        catch (error) {
            console.error("Get my tickets error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch your tickets",
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
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { ticketIds, status } = req.body;
            if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
                res.status(400).json({
                    success: false,
                    error: "Ticket IDs array is required",
                });
                return;
            }
            if (!status) {
                res.status(400).json({
                    success: false,
                    error: "Status is required",
                });
                return;
            }
            const result = await database_1.prisma.ticket.updateMany({
                where: {
                    id: { in: ticketIds },
                    tenantId: req.tenantId,
                },
                data: {
                    status,
                    updatedAt: new Date(),
                },
            });
            res.status(200).json({
                success: true,
                data: { updatedCount: result.count },
                message: `${result.count} tickets updated successfully`,
            });
        }
        catch (error) {
            console.error("Bulk update status error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to update tickets",
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
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { projectId } = req.params;
            const ticketStats = await database_1.prisma.ticket.groupBy({
                by: ["status"],
                where: {
                    projectId,
                    tenantId: req.tenantId,
                },
                _count: true,
            });
            const totalTickets = await database_1.prisma.ticket.count({
                where: { projectId, tenantId: req.tenantId },
            });
            // return {
            //   projectId,
            //   totalTickets,
            //   stats: ticketStats
            // };
            const stats = {
                projectId,
                totalTickets,
                stats: ticketStats,
            };
            res.status(200).json({
                success: true,
                data: stats,
            });
        }
        catch (error) {
            console.error("Get ticket stats by project error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch ticket statistics",
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
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            // Verify ticket exists and belongs to tenant
            const ticket = await database_1.prisma.ticket.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                },
            });
            if (!ticket) {
                throw new types_1.NotFoundError("Ticket not found");
            }
            const workflowSteps = await database_1.prisma.ticketWorkflowStep.findMany({
                where: {
                    ticketId: id,
                    tenantId: req.tenantId,
                },
                orderBy: { createdAt: "asc" },
            });
            res.status(200).json({
                success: true,
                data: workflowSteps,
            });
        }
        catch (error) {
            console.error("Get workflow steps error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to fetch workflow steps",
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
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const { stepName, updates } = req.body;
            if (!stepName || !updates) {
                res.status(400).json({
                    success: false,
                    error: "Step name and updates are required",
                });
                return;
            }
            // Verify ticket exists and belongs to tenant
            const ticket = await database_1.prisma.ticket.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                },
            });
            if (!ticket) {
                throw new types_1.NotFoundError("Ticket not found");
            }
            // Find or create workflow step
            let workflowStep = await database_1.prisma.ticketWorkflowStep.findFirst({
                where: {
                    ticketId: id,
                    stepName,
                    tenantId: req.tenantId,
                },
            });
            if (!workflowStep) {
                // Create new workflow step
                workflowStep = await database_1.prisma.ticketWorkflowStep.create({
                    data: {
                        ticketId: id,
                        tenantId: req.tenantId,
                        stepName,
                        status: updates.status || "not_started",
                        assignedTo: updates.assignedTo || [],
                        approvers: updates.approvers || [],
                        approvalStatus: updates.approvalStatus || [],
                        documents: updates.documents || [],
                        notes: updates.notes,
                        startDate: updates.startDate ? new Date(updates.startDate) : null,
                        endDate: updates.endDate ? new Date(updates.endDate) : null,
                        completedAt: updates.status === "completed" ? new Date() : null,
                        scheduledMeeting: updates.scheduledMeeting || null,
                        branchName: updates.branchName,
                        testResults: updates.testResults || [],
                    },
                });
            }
            else {
                // Update existing workflow step
                workflowStep = await database_1.prisma.ticketWorkflowStep.update({
                    where: { id: workflowStep.id },
                    data: {
                        ...updates,
                        completedAt: updates.status === "completed"
                            ? new Date()
                            : workflowStep.completedAt,
                        updatedAt: new Date(),
                    },
                });
            }
            // Log activity
            await database_1.prisma.ticketActivityLog.create({
                data: {
                    ticketId: id,
                    tenantId: req.tenantId,
                    action: `Workflow Step Updated: ${stepName}`,
                    performedById: req.user.id,
                    details: updates,
                },
            });
            // Update ticket's current workflow step if needed
            if (updates.status === "completed") {
                await database_1.prisma.ticket.update({
                    where: { id },
                    data: {
                        currentWorkflowStep: stepName,
                        updatedAt: new Date(),
                    },
                });
            }
            const result = workflowStep;
            res.status(200).json({
                success: true,
                data: result,
                message: "Workflow step updated successfully",
            });
        }
        catch (error) {
            console.error("Update workflow step error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to update workflow step",
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
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            // Verify ticket exists and belongs to tenant
            const ticket = await database_1.prisma.ticket.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                },
            });
            if (!ticket) {
                throw new types_1.NotFoundError("Ticket not found");
            }
            const comments = await database_1.prisma.ticketComment.findMany({
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
                        },
                    },
                },
                orderBy: { timestamp: "asc" },
            });
            res.status(200).json({
                success: true,
                data: comments,
            });
        }
        catch (error) {
            console.error("Get comments error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to fetch comments",
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
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const { comment, attachments = [] } = req.body;
            if (!comment || comment.trim() === "") {
                res.status(400).json({
                    success: false,
                    error: "Comment text is required",
                });
                return;
            }
            // Verify ticket exists and belongs to tenant
            const ticket = await database_1.prisma.ticket.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                },
            });
            if (!ticket) {
                throw new types_1.NotFoundError("Ticket not found");
            }
            // Create comment
            const newComment = await database_1.prisma.ticketComment.create({
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
                        },
                    },
                },
            });
            // Invalidate comments cache
            await cacheService_1.default.invalidateComments(id, req.tenantId);
            // Log activity
            await database_1.prisma.ticketActivityLog.create({
                data: {
                    ticketId: id,
                    tenantId: req.tenantId,
                    action: "Comment Added",
                    performedById: req.user.id,
                    details: { comment },
                },
            });
            res.status(201).json({
                success: true,
                data: newComment,
                message: "Comment added successfully",
            });
        }
        catch (error) {
            console.error("Add comment error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to add comment",
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
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { ticketId, commentId } = req.params;
            const { comment } = req.body;
            if (!comment || comment.trim() === "") {
                res.status(400).json({
                    success: false,
                    error: "Comment text is required",
                });
                return;
            }
            // Verify ticket exists and belongs to tenant
            const ticket = await database_1.prisma.ticket.findFirst({
                where: {
                    id: ticketId,
                    tenantId: req.tenantId,
                },
            });
            if (!ticket) {
                throw new types_1.NotFoundError("Ticket not found");
            }
            // Verify comment exists and belongs to this user
            const existingComment = await database_1.prisma.ticketComment.findFirst({
                where: {
                    id: commentId,
                    ticketId,
                    tenantId: req.tenantId,
                    userId: req.user.id, // Only owner can update
                },
            });
            if (!existingComment) {
                throw new types_1.NotFoundError("Comment not found or you do not have permission to edit it");
            }
            // Update comment
            const updatedComment = await database_1.prisma.ticketComment.update({
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
                        },
                    },
                },
            });
            // Log activity
            await database_1.prisma.ticketActivityLog.create({
                data: {
                    ticketId,
                    tenantId: req.tenantId,
                    action: "Comment Updated",
                    performedById: req.user.id,
                    details: { commentId },
                },
            });
            res.status(200).json({
                success: true,
                data: updatedComment,
                message: "Comment updated successfully",
            });
        }
        catch (error) {
            console.error("Update comment error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to update comment",
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
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { ticketId, commentId } = req.params;
            // Verify ticket exists and belongs to tenant
            const ticket = await database_1.prisma.ticket.findFirst({
                where: {
                    id: ticketId,
                    tenantId: req.tenantId,
                },
            });
            if (!ticket) {
                throw new types_1.NotFoundError("Ticket not found");
            }
            // Verify comment exists and belongs to this user
            const existingComment = await database_1.prisma.ticketComment.findFirst({
                where: {
                    id: commentId,
                    ticketId,
                    tenantId: req.tenantId,
                    userId: req.user.id, // Only owner can delete
                },
            });
            if (!existingComment) {
                throw new types_1.NotFoundError("Comment not found or you do not have permission to delete it");
            }
            // Delete comment
            await database_1.prisma.ticketComment.delete({
                where: { id: commentId },
            });
            // Invalidate comments cache
            await cacheService_1.default.invalidateComments(ticketId, req.tenantId);
            // Log activity
            await database_1.prisma.ticketActivityLog.create({
                data: {
                    ticketId,
                    tenantId: req.tenantId,
                    action: "Comment Deleted",
                    performedById: req.user.id,
                    details: { commentId, comment: existingComment.comment },
                },
            });
            res.status(200).json({
                success: true,
                message: "Comment deleted successfully",
            });
        }
        catch (error) {
            console.error("Delete comment error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to delete comment",
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
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            // Verify ticket exists and belongs to tenant
            const ticket = await database_1.prisma.ticket.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                },
            });
            if (!ticket) {
                throw new types_1.NotFoundError("Ticket not found");
            }
            const relatedLinks = await database_1.prisma.ticketRelatedLink.findMany({
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
                        },
                    },
                },
                orderBy: { addedAt: "desc" },
            });
            res.status(200).json({
                success: true,
                data: relatedLinks,
            });
        }
        catch (error) {
            console.error("Get related links error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to fetch related links",
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
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const { linkType, title, description, url } = req.body;
            if (!linkType || !title || !description || !url) {
                res.status(400).json({
                    success: false,
                    error: "Link type, title, description, and URL are required",
                });
                return;
            }
            // Verify ticket exists and belongs to tenant
            const ticket = await database_1.prisma.ticket.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                },
            });
            if (!ticket) {
                throw new types_1.NotFoundError("Ticket not found");
            }
            // Create related link
            const newLink = await database_1.prisma.ticketRelatedLink.create({
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
                        },
                    },
                },
            });
            // Invalidate links cache
            await cacheService_1.default.invalidateLinks(id, req.tenantId);
            // Log activity
            await database_1.prisma.ticketActivityLog.create({
                data: {
                    ticketId: id,
                    tenantId: req.tenantId,
                    action: "Related Link Added",
                    performedById: req.user.id,
                    details: { linkType, title, url },
                },
            });
            res.status(201).json({
                success: true,
                data: newLink,
                message: "Related link added successfully",
            });
        }
        catch (error) {
            console.error("Add related link error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to add related link",
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
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { ticketId, linkId } = req.params;
            const { title, description, url } = req.body;
            // Verify ticket exists and belongs to tenant
            const ticket = await database_1.prisma.ticket.findFirst({
                where: {
                    id: ticketId,
                    tenantId: req.tenantId,
                },
            });
            if (!ticket) {
                throw new types_1.NotFoundError("Ticket not found");
            }
            // Verify related link exists and belongs to this ticket and tenant
            const existingLink = await database_1.prisma.ticketRelatedLink.findFirst({
                where: {
                    id: linkId,
                    ticketId,
                    tenantId: req.tenantId,
                },
            });
            if (!existingLink) {
                throw new types_1.NotFoundError("Related link not found");
            }
            // Update related link
            const updatedLink = await database_1.prisma.ticketRelatedLink.update({
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
                        },
                    },
                },
            });
            // Log activity
            await database_1.prisma.ticketActivityLog.create({
                data: {
                    ticketId,
                    tenantId: req.tenantId,
                    action: "Related Link Updated",
                    performedById: req.user.id,
                    details: { linkId, title, description, url },
                },
            });
            res.status(200).json({
                success: true,
                data: updatedLink,
                message: "Related link updated successfully",
            });
        }
        catch (error) {
            console.error("Update related link error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to update related link",
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
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { ticketId, linkId } = req.params;
            // Verify ticket exists and belongs to tenant
            const ticket = await database_1.prisma.ticket.findFirst({
                where: {
                    id: ticketId,
                    tenantId: req.tenantId,
                },
            });
            if (!ticket) {
                throw new types_1.NotFoundError("Ticket not found");
            }
            // Verify related link exists and belongs to this ticket and tenant
            const existingLink = await database_1.prisma.ticketRelatedLink.findFirst({
                where: {
                    id: linkId,
                    ticketId,
                    tenantId: req.tenantId,
                },
            });
            if (!existingLink) {
                throw new types_1.NotFoundError("Related link not found");
            }
            // Delete related link
            await database_1.prisma.ticketRelatedLink.delete({
                where: { id: linkId },
            });
            // Invalidate links cache
            await cacheService_1.default.invalidateLinks(ticketId, req.tenantId);
            // Log activity
            await database_1.prisma.ticketActivityLog.create({
                data: {
                    ticketId,
                    tenantId: req.tenantId,
                    action: "Related Link Deleted",
                    performedById: req.user.id,
                    details: { linkId, title: existingLink.title },
                },
            });
            res.status(200).json({
                success: true,
                message: "Related link deleted successfully",
            });
        }
        catch (error) {
            console.error("Delete related link error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to delete related link",
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
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            // Verify ticket exists and belongs to tenant
            const ticket = await database_1.prisma.ticket.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                },
            });
            if (!ticket) {
                throw new types_1.NotFoundError("Ticket not found");
            }
            const activityLog = await database_1.prisma.ticketActivityLog.findMany({
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
                        },
                    },
                },
                orderBy: { timestamp: "desc" },
            });
            res.status(200).json({
                success: true,
                data: activityLog,
            });
        }
        catch (error) {
            console.error("Get activity log error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to fetch activity log",
            });
        }
    }
    /**
     * Upload attachment to ticket (tenant-aware)
     */
    static async uploadAttachment(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const { file, fileName } = req.body;
            if (!file || !fileName) {
                res.status(400).json({
                    success: false,
                    error: "File data and file name are required",
                });
                return;
            }
            // Verify ticket exists and belongs to tenant
            const ticket = await database_1.prisma.ticket.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                },
            });
            if (!ticket) {
                throw new types_1.NotFoundError("Ticket not found");
            }
            // Upload file to R2
            const { fileUrl, fileSize, fileType } = await (0, r2Client_1.uploadFileToR2)(file, fileName, req.tenantId, id);
            // Create attachment record in database
            const attachment = await database_1.prisma.ticketAttachment.create({
                data: {
                    tenantId: req.tenantId,
                    ticketId: id,
                    fileName,
                    fileUrl,
                    fileSize,
                    fileType,
                    uploadedById: req.user.id,
                },
                include: {
                    uploadedBy: {
                        select: {
                            id: true,
                            name: true,
                            workEmail: true,
                            position: true,
                        },
                    },
                },
            });
            // Log activity
            await database_1.prisma.ticketActivityLog.create({
                data: {
                    ticketId: id,
                    tenantId: req.tenantId,
                    action: "Attachment Added",
                    performedById: req.user.id,
                    details: { fileName, fileSize, fileType },
                },
            });
            res.status(201).json({
                success: true,
                data: attachment,
                message: "Attachment uploaded successfully",
            });
        }
        catch (error) {
            console.error("Upload attachment error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: error.message || "Failed to upload attachment",
            });
        }
    }
    /**
     * Get attachments for a ticket (tenant-aware)
     */
    static async getAttachments(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            // Verify ticket exists and belongs to tenant
            const ticket = await database_1.prisma.ticket.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                },
            });
            if (!ticket) {
                throw new types_1.NotFoundError("Ticket not found");
            }
            const attachments = await database_1.prisma.ticketAttachment.findMany({
                where: {
                    ticketId: id,
                    tenantId: req.tenantId,
                },
                include: {
                    uploadedBy: {
                        select: {
                            id: true,
                            name: true,
                            workEmail: true,
                            position: true,
                        },
                    },
                },
                orderBy: { uploadedAt: "desc" },
            });
            res.status(200).json({
                success: true,
                data: attachments,
            });
        }
        catch (error) {
            console.error("Get attachments error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to fetch attachments",
            });
        }
    }
    /**
     * Delete attachment (tenant-aware)
     */
    static async deleteAttachment(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { ticketId, attachmentId } = req.params;
            // Verify ticket exists and belongs to tenant
            const ticket = await database_1.prisma.ticket.findFirst({
                where: {
                    id: ticketId,
                    tenantId: req.tenantId,
                },
            });
            if (!ticket) {
                throw new types_1.NotFoundError("Ticket not found");
            }
            // Verify attachment exists and belongs to this ticket and tenant
            const attachment = await database_1.prisma.ticketAttachment.findFirst({
                where: {
                    id: attachmentId,
                    ticketId,
                    tenantId: req.tenantId,
                },
            });
            if (!attachment) {
                throw new types_1.NotFoundError("Attachment not found");
            }
            // Delete file from R2
            try {
                await (0, r2Client_1.deleteFileFromR2)(attachment.fileUrl, req.tenantId);
            }
            catch (error) {
                console.error("Failed to delete file from R2:", error);
                // Continue with database deletion even if R2 deletion fails
            }
            // Delete attachment record from database
            await database_1.prisma.ticketAttachment.delete({
                where: { id: attachmentId },
            });
            // Log activity
            await database_1.prisma.ticketActivityLog.create({
                data: {
                    ticketId,
                    tenantId: req.tenantId,
                    action: "Attachment Deleted",
                    performedById: req.user.id,
                    details: {
                        attachmentId,
                        fileName: attachment.fileName,
                        fileSize: attachment.fileSize,
                    },
                },
            });
            res.status(200).json({
                success: true,
                message: "Attachment deleted successfully",
            });
        }
        catch (error) {
            console.error("Delete attachment error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to delete attachment",
            });
        }
    }
    /**
     * Get all Epic tickets (tenant-aware)
     * Returns epics with child story counts and progress
     */
    static async getEpics(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { projectId, status } = req.query;
            // Build filter
            const where = {
                tenantId: req.tenantId,
                type: "Epic",
            };
            if (projectId)
                where.projectId = projectId;
            if (status)
                where.status = status;
            // Get epics with story counts
            const epics = await database_1.prisma.ticket.findMany({
                where,
                select: {
                    id: true,
                    ticketNumber: true,
                    title: true,
                    description: true,
                    status: true,
                    priority: true,
                    storyPoint: true,
                    dueDate: true,
                    createdAt: true,
                    updatedAt: true,
                    project: {
                        select: { id: true, name: true, code: true },
                    },
                    assignee: {
                        select: { id: true, name: true, workEmail: true },
                    },
                    // Get child stories
                    stories: {
                        select: {
                            id: true,
                            ticketNumber: true,
                            title: true,
                            status: true,
                            storyPoint: true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
            });
            // Calculate progress for each epic
            const epicsWithProgress = epics.map((epic) => {
                const totalStories = epic.stories.length;
                const completedStories = epic.stories.filter((story) => story.status === "completed").length;
                const totalPoints = epic.stories.reduce((sum, story) => sum + (story.storyPoint || 0), 0);
                const completedPoints = epic.stories
                    .filter((story) => story.status === "completed")
                    .reduce((sum, story) => sum + (story.storyPoint || 0), 0);
                return {
                    ...epic,
                    stats: {
                        totalStories,
                        completedStories,
                        totalPoints,
                        completedPoints,
                        progress: totalStories > 0
                            ? Math.round((completedStories / totalStories) * 100)
                            : 0,
                    },
                };
            });
            res.status(200).json({
                success: true,
                data: epicsWithProgress,
            });
        }
        catch (error) {
            console.error("Get epics error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch epics",
            });
        }
    }
    /**
     * Get Epic with detailed story progress (tenant-aware)
     */
    static async getEpicProgress(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            // Get epic with all stories
            const epic = await database_1.prisma.ticket.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    type: "Epic",
                },
                select: {
                    id: true,
                    ticketNumber: true,
                    title: true,
                    description: true,
                    status: true,
                    priority: true,
                    storyPoint: true,
                    dueDate: true,
                    createdAt: true,
                    updatedAt: true,
                    project: {
                        select: { id: true, name: true, code: true },
                    },
                    assignee: {
                        select: { id: true, name: true, workEmail: true },
                    },
                    stories: {
                        select: {
                            id: true,
                            ticketNumber: true,
                            title: true,
                            status: true,
                            priority: true,
                            storyPoint: true,
                            estimateHours: true,
                            dueDate: true,
                            assignee: {
                                select: { id: true, name: true, workEmail: true },
                            },
                            // Get sub-tasks for each story
                            subTasks: {
                                select: {
                                    id: true,
                                    ticketNumber: true,
                                    title: true,
                                    status: true,
                                },
                            },
                        },
                        orderBy: { createdAt: "asc" },
                    },
                },
            });
            if (!epic) {
                res.status(404).json({
                    success: false,
                    error: "Epic not found",
                });
                return;
            }
            // Calculate detailed progress
            const totalStories = epic.stories.length;
            const completedStories = epic.stories.filter((s) => s.status === "completed").length;
            const inProgressStories = epic.stories.filter((s) => s.status === "in_progress").length;
            const notStartedStories = epic.stories.filter((s) => s.status === "not_started").length;
            const totalPoints = epic.stories.reduce((sum, s) => sum + (s.storyPoint || 0), 0);
            const completedPoints = epic.stories
                .filter((s) => s.status === "completed")
                .reduce((sum, s) => sum + (s.storyPoint || 0), 0);
            const totalSubTasks = epic.stories.reduce((sum, s) => sum + s.subTasks.length, 0);
            const completedSubTasks = epic.stories.reduce((sum, s) => sum +
                s.subTasks.filter((st) => st.status === "completed").length, 0);
            res.status(200).json({
                success: true,
                data: {
                    ...epic,
                    progress: {
                        stories: {
                            total: totalStories,
                            completed: completedStories,
                            inProgress: inProgressStories,
                            notStarted: notStartedStories,
                            percentage: totalStories > 0
                                ? Math.round((completedStories / totalStories) * 100)
                                : 0,
                        },
                        storyPoints: {
                            total: totalPoints,
                            completed: completedPoints,
                            percentage: totalPoints > 0
                                ? Math.round((completedPoints / totalPoints) * 100)
                                : 0,
                        },
                        subTasks: {
                            total: totalSubTasks,
                            completed: completedSubTasks,
                            percentage: totalSubTasks > 0
                                ? Math.round((completedSubTasks / totalSubTasks) * 100)
                                : 0,
                        },
                    },
                },
            });
        }
        catch (error) {
            console.error("Get epic progress error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch epic progress",
            });
        }
    }
    /**
     * Get sub-tasks for a ticket (Story or Task) (tenant-aware)
     */
    static async getSubTasks(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            // Verify parent ticket exists
            const parentTicket = await database_1.prisma.ticket.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                },
            });
            if (!parentTicket) {
                res.status(404).json({
                    success: false,
                    error: "Parent ticket not found",
                });
                return;
            }
            // Get sub-tasks
            const subTasks = await database_1.prisma.ticket.findMany({
                where: {
                    parentId: id,
                    tenantId: req.tenantId,
                    type: "Sub-task",
                },
                select: {
                    id: true,
                    ticketNumber: true,
                    title: true,
                    description: true,
                    status: true,
                    priority: true,
                    storyPoint: true,
                    estimateHours: true,
                    dueDate: true,
                    createdAt: true,
                    updatedAt: true,
                    assignee: {
                        select: { id: true, name: true, workEmail: true },
                    },
                },
                orderBy: { createdAt: "asc" },
            });
            // Calculate progress
            const total = subTasks.length;
            const completed = subTasks.filter((st) => st.status === "completed")
                .length;
            const inProgress = subTasks.filter((st) => st.status === "in_progress")
                .length;
            res.status(200).json({
                success: true,
                data: {
                    parentTicket: {
                        id: parentTicket.id,
                        ticketNumber: parentTicket.ticketNumber,
                        title: parentTicket.title,
                        type: parentTicket.type,
                    },
                    subTasks,
                    progress: {
                        total,
                        completed,
                        inProgress,
                        notStarted: total - completed - inProgress,
                        percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
                    },
                },
            });
        }
        catch (error) {
            console.error("Get sub-tasks error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch sub-tasks",
            });
        }
    }
}
exports.TicketController = TicketController;
//# sourceMappingURL=ticketController.js.map