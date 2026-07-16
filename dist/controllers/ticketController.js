"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TicketController = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const database_1 = require("@/config/database");
const dbpool_1 = __importDefault(require("@/config/dbpool"));
const types_1 = require("@/types");
const r2Client_1 = require("@/utils/r2Client");
const htmlSanitizer_1 = require("@/utils/htmlSanitizer");
const socketService_1 = require("@/services/socketService");
const cacheService_1 = __importDefault(require("@/utils/cacheService"));
const aiTicketService_1 = require("@/services/aiTicketService");
const EntitlementService_1 = require("@/services/EntitlementService");
const transactionHistory_1 = require("@/utils/transactionHistory");
const crypto_1 = require("crypto");
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
                error: "Failed to upload image",
            });
        }
    }
    /**
     * Get public ticket details by ID (no auth required)
     */
    static async getPublicTicket(req, res) {
        try {
            const { id } = req.params;
            const ticket = await database_1.prisma.ticket.findUnique({
                where: { id },
                include: {
                    project: {
                        select: {
                            name: true,
                            code: true,
                        },
                    },
                    assignee: {
                        select: {
                            name: true,
                            position: true,
                            avatarUrl: true,
                        },
                    },
                    createdBy: {
                        select: {
                            name: true,
                            avatarUrl: true,
                        },
                    },
                    comments: {
                        include: {
                            user: {
                                select: {
                                    name: true,
                                    position: true,
                                    avatarUrl: true,
                                },
                            },
                        },
                        orderBy: { timestamp: "desc" },
                    },
                    relatedLinks: {
                        include: {
                            addedBy: {
                                select: {
                                    name: true,
                                    avatarUrl: true,
                                },
                            },
                        },
                    },
                    attachments: true,
                    subTasks: {
                        where: { isDeleted: false },
                        select: {
                            id: true,
                            ticketNumber: true,
                            title: true,
                            status: true,
                            priority: true,
                            type: true,
                        },
                    },
                    activityLog: {
                        orderBy: { timestamp: "desc" },
                        include: {
                            performedBy: {
                                select: {
                                    name: true,
                                    avatarUrl: true,
                                },
                            },
                        },
                    },
                },
            });
            if (!ticket) {
                res.status(404).json({
                    success: false,
                    error: "Ticket not found",
                });
                return;
            }
            // Generate presigned URLs for secure access
            const attachmentsWithSignedUrls = await Promise.all(ticket.attachments.map(async (attachment) => {
                try {
                    const { generatePresignedUrl } = require("@/utils/r2Client");
                    const signedUrl = await generatePresignedUrl(attachment.fileUrl, 86400);
                    return {
                        ...attachment,
                        fileUrl: signedUrl,
                    };
                }
                catch (e) {
                    console.error(`Failed to generate signed URL for public attachment ${attachment.id}:`, e);
                    return attachment;
                }
            }));
            // Return only necessary fields for public view
            const publicData = {
                id: ticket.id,
                title: ticket.title,
                description: ticket.description,
                status: ticket.status,
                priority: ticket.priority,
                type: ticket.type,
                ticketNumber: ticket.ticketNumber,
                createdAt: ticket.createdAt,
                updatedAt: ticket.updatedAt,
                project: ticket.project,
                assignee: ticket.assignee,
                createdBy: ticket.createdBy,
                comments: ticket.comments.map(c => ({
                    id: c.id,
                    comment: c.comment,
                    timestamp: c.timestamp,
                    user: c.user,
                })),
                relatedLinks: ticket.relatedLinks,
                attachments: attachmentsWithSignedUrls,
                subTasks: ticket.subTasks,
                activityLogs: ticket.activityLog.map(log => ({
                    id: log.id,
                    action: log.action,
                    details: log.details,
                    timestamp: log.timestamp,
                    performedBy: log.performedBy,
                })),
            };
            res.status(200).json({
                success: true,
                data: publicData,
            });
        }
        catch (error) {
            console.error("Get public ticket error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch ticket details",
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
            // General statistics (All time within tenant)
            const generalStats = await database_1.prisma.ticket.groupBy({
                by: ["status"],
                where: {
                    tenantId: req.tenantId,
                    isDeleted: false,
                },
                _count: true,
            });
            // Project-specific statistics
            const projectWiseStats = await database_1.prisma.ticket.groupBy({
                by: ["projectId", "status"],
                where: {
                    tenantId: req.tenantId,
                    isDeleted: false,
                },
                _count: true,
            });
            const totalTickets = generalStats.reduce((sum, stat) => sum + stat._count, 0);
            const statusCounts = {
                total: totalTickets,
                in_progress: generalStats.find((s) => s.status === "in_progress")?._count || 0,
                dev_complete: generalStats.find((s) => s.status === "dev_complete")?._count || 0,
                in_testing: generalStats.find((s) => s.status === "in_testing")?._count || 0,
                in_review: generalStats.find((s) => s.status === "in_review")?._count || 0,
                not_started: generalStats.find((s) => s.status === "not_started")?._count || 0,
                completed: generalStats.find((s) => s.status === "completed")?._count || 0,
                live: generalStats.find((s) => s.status === "live")?._count || 0,
                blocked: generalStats.find((s) => s.status === "blocked")?._count || 0,
            };
            // Format projectStats as expected by the frontend: { id: projectId, statuses: [{ status, count }] }
            const projectStatsMap = new Map();
            projectWiseStats.forEach((stat) => {
                if (!projectStatsMap.has(stat.projectId)) {
                    projectStatsMap.set(stat.projectId, []);
                }
                projectStatsMap.get(stat.projectId).push({
                    status: stat.status,
                    count: stat._count,
                });
            });
            const projectStats = Array.from(projectStatsMap.entries()).map(([id, statuses]) => ({
                id,
                statuses,
            }));
            const stats = {
                generalStats: statusCounts,
                projectStats,
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
            // Generate ticket number with retry logic to handle race conditions
            let ticket;
            let ticketNumber = "";
            let attempts = 0;
            const maxAttempts = 5;
            while (attempts < maxAttempts) {
                attempts++;
                // Find the highest ticket sequence for THIS specific project (by projectId, not just prefix)
                // Using raw SQL MAX on numeric suffix for reliable numeric ordering
                const seqResult = await database_1.prisma.$queryRaw `
          SELECT COALESCE(
            MAX((regexp_match(ticket_number, '-(\\d+)$'))[1]::int),
            0
          ) + 1 AS next_seq
          FROM tickets
          WHERE tenant_id = ${req.tenantId}
            AND project_id = ${projectId}
            AND ticket_number ~ '-\\d+$'
        `;
                const nextTicketNumber = seqResult[0]?.next_seq ?? 1;
                ticketNumber = `${project.code || "TKT"}-${String(nextTicketNumber).padStart(4, "0")}`;
                try {
                    // Prepare metadata for additional fields not in schema
                    const metadata = {
                        parentTickets,
                        releasePlan,
                    };
                    // Create ticket with fields at root level (matching Prisma schema)
                    ticket = await database_1.prisma.ticket.create({
                        data: {
                            tenantId: req.tenantId,
                            title,
                            description: sanitizedDescription,
                            projectId,
                            status: status ? status.toLowerCase() : "not_started",
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
                                select: { id: true, name: true, workEmail: true, position: true, avatarUrl: true },
                            },
                            assignee: {
                                select: { id: true, name: true, workEmail: true, position: true, avatarUrl: true },
                            },
                            reportTo: {
                                select: { id: true, name: true, workEmail: true, position: true, avatarUrl: true },
                            },
                            project: {
                                select: { id: true, name: true, code: true, description: true },
                            },
                        },
                    });
                    // If creation succeeded, break the retry loop
                    break;
                }
                catch (error) {
                    // Check if it's a unique constraint error on ticketNumber
                    if (error.code === 'P2002' && error.meta?.target?.includes('ticket_number')) {
                        console.warn(`Ticket number collision on ${ticketNumber}, attempt ${attempts}/${maxAttempts}. Retrying...`);
                        if (attempts >= maxAttempts) {
                            throw error; // Max attempts reached
                        }
                        continue; // Try again with a new number
                    }
                    throw error; // Rethrow other errors
                }
            }
            socketService_1.socketService.emitToTenant(req.tenantId, "ticket:created", ticket);
            // Log activity
            await database_1.prisma.ticketActivityLog.create({
                data: {
                    ticketId: ticket.id,
                    tenantId: req.tenantId,
                    action: "Ticket Created",
                    performedById: req.user.id,
                    details: {
                        ticketNumber,
                        title,
                        priority,
                        type: ticketType,
                        status,
                    },
                },
            });
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.TICKETS,
                page: transactionHistory_1.Page.TICKET_LIST,
                action: transactionHistory_1.Action.CREATE,
                actionLabel: "Ticket created",
                entityType: transactionHistory_1.EntityType.TICKET,
                entityId: ticket.id,
                entityLabel: `${ticketNumber} — ${title}`,
                parentEntityType: projectId ? "project" : null,
                parentEntityId: projectId ?? null,
                afterData: {
                    ticketNumber,
                    title,
                    status,
                    priority,
                    type: ticketType,
                    projectId,
                    assigneeId,
                    dueDate,
                },
                statusCode: 201,
            });
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
     * Generate a structured ticket draft from a free-form description using AI.
     * Does not persist anything — the client previews and edits, then calls POST /api/tickets.
     */
    static async aiGenerateTicket(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { description, title } = req.body;
            const seed = [title, description].filter(Boolean).join("\n\n").trim();
            if (!seed || seed.length < 5) {
                res.status(400).json({
                    success: false,
                    error: "Description is required (min 5 characters)",
                });
                return;
            }
            if (seed.length > 8000) {
                res.status(400).json({
                    success: false,
                    error: "Description is too long (max 8000 characters)",
                });
                return;
            }
            await EntitlementService_1.entitlementService.checkLimit(req.tenantId, 'ai_credits_month');
            const { draft, source, fallbackReason } = await (0, aiTicketService_1.generateTicketDraft)(seed);
            await EntitlementService_1.entitlementService.incrementUsage(req.tenantId, 'ai_credits_month');
            res.status(200).json({
                success: true,
                data: { ...draft, source, fallbackReason },
                message: "Ticket draft generated",
            });
        }
        catch (error) {
            if (error instanceof EntitlementService_1.EntitlementError) {
                res.status(403).json({ success: false, error: 'AI limit reached', details: { current: error.current, allowed: error.allowed } });
                return;
            }
            console.error("AI generate ticket error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to generate ticket draft",
            });
        }
    }
    /**
     * Regenerate just the subtasks for a Zai-drafted ticket, with caller-specified
     * shape (count + hours-each). Doesn't persist anything.
     */
    static async aiGenerateSubtasks(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { description, count, hoursEach } = req.body;
            const seed = String(description || "").trim();
            if (!seed || seed.length < 5) {
                res.status(400).json({
                    success: false,
                    error: "Description is required (min 5 characters)",
                });
                return;
            }
            await EntitlementService_1.entitlementService.checkLimit(req.tenantId, 'ai_credits_month');
            const result = await (0, aiTicketService_1.generateSubtasks)({ description: seed, count, hoursEach });
            await EntitlementService_1.entitlementService.incrementUsage(req.tenantId, 'ai_credits_month');
            res.status(200).json({
                success: true,
                data: result,
                message: "Subtasks generated",
            });
        }
        catch (error) {
            if (error instanceof EntitlementService_1.EntitlementError) {
                res.status(403).json({ success: false, error: 'AI limit reached', details: { current: error.current, allowed: error.allowed } });
                return;
            }
            console.error("AI generate subtasks error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to generate subtasks",
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
            const { projectId, assigneeId, priority, type, search, limitPerColumn = 50, includeArchived = false, } = req.query;
            // Build base filter
            const baseWhere = {
                tenantId: req.tenantId,
                parentId: null, // Exclude subtasks from main board
                isArchived: includeArchived === 'true' ? undefined : false, // Exclude archived tickets by default
                isDeleted: false, // Exclude soft-deleted tickets
                bucketId: null, // Exclude tickets in buckets (they should only show in bucket view)
            };
            if (projectId)
                baseWhere.projectId = projectId;
            if (priority) {
                if (typeof priority === "string" && priority.includes(",")) {
                    baseWhere.priority = { in: priority.split(",").map((p) => p.trim()) };
                }
                else {
                    baseWhere.priority = priority;
                }
            }
            if (type) {
                if (typeof type === "string" && type.includes(",")) {
                    baseWhere.type = { in: type.split(",").map((t) => t.trim()) };
                }
                else {
                    baseWhere.type = type;
                }
            }
            if (assigneeId) {
                if (typeof assigneeId === "string") {
                    const ids = assigneeId.split(",").map((id) => id.trim());
                    const hasUnassigned = ids.includes("null") || ids.includes("unassigned") || ids.includes("__unassigned__");
                    const actualUserIds = ids.filter(id => id !== "null" && id !== "unassigned" && id !== "__unassigned__");
                    if (hasUnassigned) {
                        if (actualUserIds.length > 0) {
                            baseWhere.AND = [
                                ...(baseWhere.AND || []),
                                {
                                    OR: [
                                        { assigneeId: { in: actualUserIds } },
                                        { assigneeId: null }
                                    ]
                                }
                            ];
                        }
                        else {
                            baseWhere.assigneeId = null;
                        }
                    }
                    else {
                        if (actualUserIds.length > 0) {
                            baseWhere.assigneeId = actualUserIds.length === 1 ? actualUserIds[0] : { in: actualUserIds };
                        }
                    }
                }
            }
            if (search) {
                baseWhere.OR = [
                    { title: { contains: search, mode: "insensitive" } },
                    { ticketNumber: { contains: search, mode: "insensitive" } },
                    { project: { code: { contains: search, mode: "insensitive" } } },
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
            const statuses = ['not_started', 'in_progress', 'dev_complete', 'dev_testing', 'in_review', 'live', 'live_testing', 'completed', 'pause'];
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
                                    workEmail: true,
                                    avatarUrl: true
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
            const { page = 1, limit = 20, status, priority, type, projectId, assigneeId, createdById, search, sortBy = "createdAt", sortOrder = "desc", startDate, endDate, includeArchived = false, archivedOnly = false, } = req.query;
            // Build base filter
            const baseWhere = {
                tenantId: req.tenantId,
                parentId: null, // Exclude subtasks from main board
                isArchived: archivedOnly === 'true' ? true : (includeArchived === 'true' ? undefined : false), // archivedOnly shows ONLY archived tickets
                isDeleted: false, // Exclude soft-deleted tickets
                bucketId: null, // Exclude tickets in buckets (they should only show in bucket view)
            };
            const where = { ...baseWhere };
            if (status) {
                if (typeof status === "string" && status.includes(",")) {
                    where.status = { in: status.split(",").map((s) => s.trim()) };
                }
                else {
                    where.status = status;
                }
            }
            if (priority) {
                if (typeof priority === "string" && priority.includes(",")) {
                    where.priority = { in: priority.split(",").map((p) => p.trim()) };
                }
                else {
                    where.priority = priority;
                }
            }
            if (type) {
                if (typeof type === "string" && type.includes(",")) {
                    where.type = { in: type.split(",").map((t) => t.trim()) };
                }
                else {
                    where.type = type;
                }
            }
            if (projectId)
                where.projectId = projectId;
            // Handle single or multiple assignees
            if (assigneeId) {
                if (typeof assigneeId === "string") {
                    const ids = assigneeId.split(",").map((id) => id.trim());
                    const hasUnassigned = ids.includes("null") || ids.includes("unassigned") || ids.includes("__unassigned__");
                    const actualUserIds = ids.filter(id => id !== "null" && id !== "unassigned" && id !== "__unassigned__");
                    if (hasUnassigned) {
                        if (actualUserIds.length > 0) {
                            where.AND = [
                                ...(where.AND || []),
                                {
                                    OR: [
                                        { assigneeId: { in: actualUserIds } },
                                        { assigneeId: null }
                                    ]
                                }
                            ];
                        }
                        else {
                            where.assigneeId = null;
                        }
                    }
                    else {
                        if (actualUserIds.length > 0) {
                            where.assigneeId = actualUserIds.length === 1 ? actualUserIds[0] : { in: actualUserIds };
                        }
                    }
                }
            }
            if (createdById)
                where.createdById = createdById;
            // Restrict to a specific set of ticket ids (comma-separated). Used by the
            // sidebar "Show commented tickets" / "Show tickets with attachments" actions.
            const { ticketIds: ticketIdsParam } = req.query;
            if (ticketIdsParam && typeof ticketIdsParam === 'string' && ticketIdsParam.trim()) {
                const ids = ticketIdsParam.split(',').map(s => s.trim()).filter(Boolean);
                if (ids.length > 0) {
                    where.id = { in: ids };
                }
                else {
                    // Empty filter list = explicitly match nothing
                    where.id = { in: [] };
                }
            }
            // Filter by tags (comma-separated). Match tickets that have ANY of the given tags.
            const { tags: tagsParam } = req.query;
            if (tagsParam && typeof tagsParam === 'string' && tagsParam.trim()) {
                const tagList = tagsParam.split(',').map(t => t.trim()).filter(Boolean);
                if (tagList.length > 0) {
                    where.tags = { hasSome: tagList };
                }
            }
            if (search) {
                where.OR = [
                    { title: { contains: search, mode: "insensitive" } },
                    { description: { contains: search, mode: "insensitive" } },
                    { ticketNumber: { contains: search, mode: "insensitive" } },
                    { project: { code: { contains: search, mode: "insensitive" } } },
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
            let finalSortBy = sortBy;
            let finalSortOrder = sortOrder;
            // If we are looking at archived tickets and no specific sort was requested (using default),
            // default to archivedAt desc so latest archived shows first.
            if (archivedOnly === "true" && !req.query.sortBy) {
                finalSortBy = "archivedAt";
                finalSortOrder = "desc";
            }
            orderBy[finalSortBy] = finalSortOrder === "desc" ? "desc" : "asc";
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
                        stack: true,
                        tags: true,
                        taskLevel: true,
                        storyPoint: true,
                        estimateHours: true,
                        startDate: true,
                        endDate: true,
                        dueDate: true,
                        createdAt: true,
                        updatedAt: true,
                        sprintPlanId: true,
                        releasePlanId: true,
                        demoPlanId: true,
                        bucketId: true,
                        // Exclude large fields: description (can be fetched in detail view)
                        createdBy: {
                            select: { id: true, name: true, workEmail: true, avatarUrl: true },
                        },
                        assignee: {
                            select: { id: true, name: true, workEmail: true, avatarUrl: true },
                        },
                        reportTo: {
                            select: { id: true, name: true, workEmail: true, avatarUrl: true },
                        },
                        project: {
                            select: { id: true, name: true, code: true },
                        },
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
            // Check cache first — only honor cache entries that contain the new
            // sprint/release/bucket linkage fields. Older cached payloads are missing
            // them and would make the drawer mis-detect sprint membership.
            const cached = await cacheService_1.default.getTicket(id, req.tenantId);
            if (cached && 'sprintPlanId' in cached) {
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
                    sprintPlanId: true, // Required so the detail drawer knows sprint membership
                    releasePlanId: true, // Required for release-plan linkage in detail drawer
                    demoPlanId: true, // Required for demo-plan linkage in detail drawer
                    bucketId: true, // Required for bucket linkage in detail drawer
                    isArchived: true,
                    createdAt: true,
                    updatedAt: true,
                    // Optimized relations - only essential fields
                    createdBy: {
                        select: { id: true, name: true, workEmail: true, avatarUrl: true },
                    },
                    assignee: {
                        select: { id: true, name: true, workEmail: true, avatarUrl: true },
                    },
                    reportTo: {
                        select: { id: true, name: true, workEmail: true, avatarUrl: true },
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
                                select: { id: true, name: true, workEmail: true, avatarUrl: true }
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
     * Get distinct tags used across all tickets in the tenant.
     * Uses raw SQL via pg pool to UNNEST the text[] tags column.
     */
    static async getAllTags(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context required",
                });
                return;
            }
            const sql = `
        SELECT DISTINCT btrim(tag) AS tag
        FROM tickets t, UNNEST(t.tags) AS tag
        WHERE t.tenant_id = $1
          AND COALESCE(t.is_deleted, false) = false
          AND tag IS NOT NULL
          AND btrim(tag) <> ''
        ORDER BY tag ASC;
      `;
            const result = await dbpool_1.default.query(sql, [req.tenantId]);
            const tags = result.rows.map((r) => r.tag);
            res.status(200).json({
                success: true,
                data: tags,
            });
        }
        catch (error) {
            console.error("Get all tags error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch tags",
            });
        }
    }
    /**
     * Recent comments + attachments across a project (tenant-aware).
     *
     * When `userId` is provided, results are scoped to activity the user
     * cares about: comments/attachments authored by them, OR comments/
     * attachments others made on tickets assigned to them. This is the
     * relevance model used by the Ticket page sidebar.
     *
     * Each ticket appears at most once per stream (latest activity wins)
     * so a chatty ticket doesn't crowd out everything else.
     */
    static async getRecentActivity(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context required",
                });
                return;
            }
            const projectId = typeof req.query.projectId === "string" && req.query.projectId.trim() !== ""
                ? req.query.projectId.trim()
                : null;
            const userId = typeof req.query.userId === "string" && req.query.userId.trim() !== ""
                ? req.query.userId.trim()
                : null;
            const rawLimit = Number(req.query.limit);
            const limit = Number.isFinite(rawLimit) && rawLimit > 0 && rawLimit <= 50 ? Math.floor(rawLimit) : 5;
            const commentsSql = `
        SELECT
          id,
          comment,
          "timestamp",
          user_id,
          user_name,
          user_avatar_url,
          ticket_id,
          ticket_number,
          ticket_title,
          total
        FROM (
          SELECT
            tc.id,
            tc.comment,
            tc.timestamp,
            tc.user_id,
            u.name              AS user_name,
            u.avatar_url        AS user_avatar_url,
            t.id                AS ticket_id,
            t.ticket_number     AS ticket_number,
            t.title             AS ticket_title,
            ROW_NUMBER() OVER (PARTITION BY tc.ticket_id ORDER BY tc.timestamp DESC) AS rn,
            COUNT(*) OVER (PARTITION BY tc.ticket_id)                                AS total
          FROM ticket_comments tc
          JOIN tickets t ON t.id = tc.ticket_id
          JOIN users   u ON u.id = tc.user_id
          WHERE tc.tenant_id = $1
            AND ($2::text IS NULL OR t.project_id = $2)
            AND COALESCE(t.is_deleted, false) = false
            AND ($3::text IS NULL OR tc.user_id = $3 OR t.assignee_id = $3)
        ) ranked
        WHERE rn = 1
        ORDER BY "timestamp" DESC
        LIMIT $4
      `;
            const attachmentsSql = `
        SELECT
          id,
          file_name,
          file_url,
          file_type,
          uploaded_at,
          uploaded_by_id,
          uploader_name,
          uploader_avatar_url,
          ticket_id,
          ticket_number,
          ticket_title,
          total
        FROM (
          SELECT
            ta.id,
            ta.file_name,
            ta.file_url,
            ta.file_type,
            ta.uploaded_at,
            ta.uploaded_by_id,
            u.name              AS uploader_name,
            u.avatar_url        AS uploader_avatar_url,
            t.id                AS ticket_id,
            t.ticket_number     AS ticket_number,
            t.title             AS ticket_title,
            ROW_NUMBER() OVER (PARTITION BY ta.ticket_id ORDER BY ta.uploaded_at DESC) AS rn,
            COUNT(*) OVER (PARTITION BY ta.ticket_id)                                  AS total
          FROM ticket_attachments ta
          JOIN tickets t ON t.id = ta.ticket_id
          JOIN users   u ON u.id = ta.uploaded_by_id
          WHERE ta.tenant_id = $1
            AND ($2::text IS NULL OR t.project_id = $2)
            AND COALESCE(t.is_deleted, false) = false
            AND ($3::text IS NULL OR ta.uploaded_by_id = $3 OR t.assignee_id = $3)
        ) ranked
        WHERE rn = 1
        ORDER BY uploaded_at DESC
        LIMIT $4
      `;
            // Overdue tickets — assignee = user, past end_date, not closed/archived.
            // Used by the sidebar's "Overdue Tickets" section + filtered view union.
            const overdueSql = `
        SELECT
          t.id,
          t.ticket_number,
          t.title,
          t.end_date,
          t.status,
          t.priority,
          GREATEST(0, EXTRACT(DAY FROM (NOW() - t.end_date))::int) AS days_overdue
        FROM tickets t
        WHERE t.tenant_id = $1
          AND ($2::text IS NULL OR t.project_id = $2)
          AND COALESCE(t.is_deleted, false) = false
          AND COALESCE(t.is_archived, false) = false
          AND t.end_date IS NOT NULL
          AND t.end_date < NOW()
          AND LOWER(t.status) NOT IN ('completed', 'done', 'closed', 'resolved', 'live')
          AND ($3::text IS NULL OR t.assignee_id = $3)
        ORDER BY t.end_date ASC
        LIMIT $4
      `;
            const params = [req.tenantId, projectId, userId, limit];
            const [commentRes, attachmentRes, overdueRes] = await Promise.all([
                dbpool_1.default.query(commentsSql, params),
                dbpool_1.default.query(attachmentsSql, params),
                dbpool_1.default.query(overdueSql, params),
            ]);
            const comments = commentRes.rows.map((r) => ({
                id: r.id,
                comment: r.comment,
                timestamp: r.timestamp,
                total: Number(r.total) || 1,
                user: {
                    id: r.user_id,
                    name: r.user_name,
                    avatarUrl: r.user_avatar_url,
                },
                ticket: {
                    id: r.ticket_id,
                    ticketNumber: r.ticket_number,
                    title: r.ticket_title,
                },
            }));
            const attachments = attachmentRes.rows.map((r) => ({
                id: r.id,
                fileName: r.file_name,
                fileUrl: r.file_url,
                fileType: r.file_type,
                uploadedAt: r.uploaded_at,
                total: Number(r.total) || 1,
                uploadedBy: {
                    id: r.uploaded_by_id,
                    name: r.uploader_name,
                    avatarUrl: r.uploader_avatar_url,
                },
                ticket: {
                    id: r.ticket_id,
                    ticketNumber: r.ticket_number,
                    title: r.ticket_title,
                },
            }));
            const overdue = overdueRes.rows.map((r) => ({
                id: r.id,
                ticketNumber: r.ticket_number,
                title: r.title,
                endDate: r.end_date,
                status: r.status,
                priority: r.priority,
                daysOverdue: Number(r.days_overdue) || 0,
            }));
            res.status(200).json({
                success: true,
                data: { comments, attachments, overdue },
            });
        }
        catch (error) {
            console.error("Get recent ticket activity error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch recent ticket activity",
            });
        }
    }
    /**
     * Update ticket (tenant-aware)
     */
    static async updateTicket(req, res) {
        const { id } = req.params;
        const logFile = path_1.default.join(process.cwd(), 'debug_update_ticket.log');
        const log = (msg) => fs_1.default.appendFileSync(logFile, `${new Date().toISOString()} - ${msg}\n`);
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const updates = req.body;
            log(`Updating ticket ${id}. Payload: ${JSON.stringify(updates)}`);
            // Map frontend field names to backend field names (like in createTicket)
            const mappedUpdates = { ...updates };
            if (mappedUpdates.status) {
                mappedUpdates.status = mappedUpdates.status.toLowerCase();
            }
            // 1. Map relational/special fields
            if (updates.project) {
                mappedUpdates.projectId = typeof updates.project === 'object' ? updates.project.id : updates.project;
                delete mappedUpdates.project;
            }
            if (updates.assignee !== undefined) {
                const val = updates.assignee;
                mappedUpdates.assigneeId = (val === '' || val === null)
                    ? null
                    : (typeof val === 'object' ? val.id : val);
                delete mappedUpdates.assignee;
            }
            if (updates.reportTo !== undefined) {
                const val = updates.reportTo;
                mappedUpdates.reportToId = (val === '' || val === null)
                    ? null
                    : (typeof val === 'object' ? val.id : val);
                delete mappedUpdates.reportTo;
            }
            // Map taskType to type (frontend sends taskType, backend stores as type)
            if (updates.taskType) {
                mappedUpdates.type = updates.taskType;
                delete mappedUpdates.taskType;
            }
            // Handle releasePlan / sprint assignment smart mapping
            if (updates.releasePlan !== undefined || updates.sprintPlan !== undefined) {
                // FIX: Use explicit check to allow 'null' to pass through correctly
                const planId = updates.releasePlan !== undefined ? updates.releasePlan : updates.sprintPlan;
                if (planId === null || planId === 'null' || planId === '') {
                    mappedUpdates.sprintPlanId = null;
                    mappedUpdates.releasePlanId = null;
                    mappedUpdates.demoPlanId = null;
                    mappedUpdates.bucketId = null;
                    mappedUpdates.isArchived = false;
                    mappedUpdates.archivedAt = null;
                    mappedUpdates.archivedById = null;
                }
                else if (typeof planId === 'string') {
                    try {
                        const plan = await database_1.prisma.releasePlan.findUnique({ where: { id: planId } });
                        if (plan) {
                            if (plan.type === 'sprint_plan') {
                                mappedUpdates.sprintPlanId = planId;
                                // Important: clear releasePlanId if moving to a sprint
                                mappedUpdates.releasePlanId = null;
                            }
                            else if (plan.type === 'demo_plan') {
                                mappedUpdates.demoPlanId = planId;
                            }
                            else {
                                mappedUpdates.releasePlanId = planId;
                                mappedUpdates.sprintPlanId = null;
                            }
                        }
                    }
                    catch (e) {
                        console.error("[TicketController] Plan lookup failed:", e);
                        // Non-fatal, just don't set the ID
                    }
                }
                delete mappedUpdates.releasePlan;
                delete mappedUpdates.sprintPlan;
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
                    isDeleted: false,
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
            // 2. Clear out non-scalar fields and read-only fields
            const scalarFields = [
                'title', 'description', 'status', 'priority', 'type',
                'platform', 'stack', 'taskLevel', 'storyPoint', 'estimateHours',
                'assigneeId', 'reportToId', 'projectId', 'releasePlanId',
                'sprintPlanId', 'demoPlanId', 'bucketId', 'startDate', 'endDate',
                'dueDate', 'completedAt', 'tags', 'metadata', 'isArchived',
                'archivedAt', 'archivedById', 'epicId', 'parentId', 'rank'
            ];
            const dataToUpdate = {
                updatedAt: new Date(),
            };
            scalarFields.forEach(field => {
                if (mappedUpdates[field] !== undefined) {
                    // Type casting safety
                    let val = mappedUpdates[field];
                    if (field === 'storyPoint' && val !== null)
                        val = parseInt(val, 10);
                    if (field === 'estimateHours' && val !== null)
                        val = parseFloat(val);
                    dataToUpdate[field] = val;
                }
            });
            // Auto-set archivedAt if isArchived is being set to true
            if (dataToUpdate.isArchived === true && !existingTicket.isArchived) {
                dataToUpdate.archivedAt = new Date();
                dataToUpdate.archivedById = req.user.id;
            }
            // Clear archivedAt if isArchived is being set to false (unarchive)
            else if (dataToUpdate.isArchived === false && existingTicket.isArchived) {
                dataToUpdate.archivedAt = null;
                dataToUpdate.archivedById = null;
            }
            log(`Final data for Update: ${JSON.stringify(dataToUpdate)}`);
            // Actually update the ticket in database
            const ticket = await database_1.prisma.ticket.update({
                where: { id },
                data: dataToUpdate,
                select: {
                    // Core fields
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
                    parentId: true,
                    sprintPlanId: true, // CRITICAL: Include sprint assignment
                    releasePlanId: true,
                    demoPlanId: true,
                    tags: true,
                    metadata: true,
                    createdAt: true,
                    updatedAt: true,
                    // Relations
                    createdBy: { select: { id: true, name: true, workEmail: true, avatarUrl: true } },
                    assignee: { select: { id: true, name: true, workEmail: true, avatarUrl: true } },
                    reportTo: { select: { id: true, name: true, workEmail: true, avatarUrl: true } },
                    project: { select: { id: true, name: true, code: true } },
                },
            });
            // Log significant changes
            try {
                const changes = [];
                const details = {};
                if (mappedUpdates.status && mappedUpdates.status !== existingTicket.status) {
                    changes.push(`Status changed from ${existingTicket.status} to ${mappedUpdates.status}`);
                    details.oldStatus = existingTicket.status;
                    details.newStatus = mappedUpdates.status;
                }
                if (mappedUpdates.priority && mappedUpdates.priority !== existingTicket.priority) {
                    changes.push(`Priority changed from ${existingTicket.priority} to ${mappedUpdates.priority}`);
                    details.oldPriority = existingTicket.priority;
                    details.newPriority = mappedUpdates.priority;
                }
                if (mappedUpdates.assigneeId !== undefined && mappedUpdates.assigneeId !== existingTicket.assigneeId) {
                    changes.push(`Assignee updated`);
                    details.oldAssigneeId = existingTicket.assigneeId;
                    details.newAssigneeId = mappedUpdates.assigneeId;
                }
                if (mappedUpdates.storyPoint !== undefined && mappedUpdates.storyPoint !== existingTicket.storyPoint) {
                    changes.push(`Story Points changed from ${existingTicket.storyPoint} to ${mappedUpdates.storyPoint}`);
                }
                if (changes.length > 0) {
                    await database_1.prisma.ticketActivityLog.create({
                        data: {
                            ticketId: id,
                            tenantId: req.tenantId,
                            action: "Ticket Updated",
                            performedById: req.user.id,
                            details: {
                                changes,
                                ...details
                            },
                        },
                    });
                }
            }
            catch (logError) {
                console.error("Failed to log ticket update activity:", logError);
            }
            {
                const beforeSnap = {
                    status: existingTicket.status,
                    priority: existingTicket.priority,
                    assigneeId: existingTicket.assigneeId,
                    reportToId: existingTicket.reportToId,
                    title: existingTicket.title,
                    dueDate: existingTicket.dueDate,
                    storyPoint: existingTicket.storyPoint,
                    isArchived: existingTicket.isArchived,
                    sprintPlanId: existingTicket.sprintPlanId,
                    releasePlanId: existingTicket.releasePlanId,
                };
                const afterSnap = {};
                for (const k of Object.keys(beforeSnap)) {
                    if (k in mappedUpdates)
                        afterSnap[k] = mappedUpdates[k];
                }
                const { changedFields, before, after } = (0, transactionHistory_1.diffShallow)(beforeSnap, afterSnap);
                if (changedFields.length > 0) {
                    (0, transactionHistory_1.recordTransaction)({
                        req,
                        section: transactionHistory_1.Section.WORK,
                        module: transactionHistory_1.Module.TICKETS,
                        page: transactionHistory_1.Page.TICKET_DETAIL,
                        action: transactionHistory_1.Action.UPDATE,
                        actionLabel: `Ticket updated (${changedFields.join(", ")})`,
                        entityType: transactionHistory_1.EntityType.TICKET,
                        entityId: id,
                        entityLabel: `${existingTicket.ticketNumber} — ${existingTicket.title}`,
                        parentEntityType: existingTicket.projectId ? "project" : null,
                        parentEntityId: existingTicket.projectId ?? null,
                        beforeData: before,
                        afterData: after,
                        changedFields,
                        statusCode: 200,
                    });
                }
            }
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
                // Sync bug list when ticket assignee changes
                if (mappedUpdates.assigneeId !== undefined && mappedUpdates.assigneeId !== existingTicket.assigneeId) {
                    // Update bugs linked to this ticket with new assignee
                    promises.push(dbpool_1.default.query(`UPDATE bugs 
                 SET assignee_id = $1, updated_at = NOW()
               WHERE ticket_id = $2 AND tenant_id = $3`, [mappedUpdates.assigneeId, id, req.tenantId]));
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
            log(`Update ticket error for ${id}: ${error.stack || error.message || error}`);
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
                details: error.message // Sending details temporarily for debugging
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
            // Move to trash (soft delete)
            await database_1.prisma.ticket.update({
                where: { id },
                data: {
                    isDeleted: true,
                    deletedAt: new Date(),
                    deletedById: req.user.id,
                    updatedAt: new Date(),
                },
            });
            // Log activity
            try {
                await database_1.prisma.ticketActivityLog.create({
                    data: {
                        ticketId: id,
                        tenantId: req.tenantId,
                        action: "Ticket Moved to Trash",
                        performedById: req.user.id,
                        details: {
                            ticketNumber: ticket.ticketNumber,
                            title: ticket.title,
                        },
                    },
                });
            }
            catch (logError) {
                console.error("Failed to log ticket deletion activity:", logError);
            }
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.TICKETS,
                page: transactionHistory_1.Page.TICKET_DETAIL,
                action: transactionHistory_1.Action.DELETE,
                actionLabel: "Ticket moved to trash",
                entityType: transactionHistory_1.EntityType.TICKET,
                entityId: id,
                entityLabel: `${ticket.ticketNumber} — ${ticket.title}`,
                parentEntityType: ticket.projectId ? "project" : null,
                parentEntityId: ticket.projectId ?? null,
                beforeData: {
                    status: ticket.status,
                    isDeleted: ticket.isDeleted,
                },
                afterData: {
                    status: ticket.status,
                    isDeleted: true,
                    deletedAt: new Date().toISOString(),
                },
                changedFields: ["isDeleted", "deletedAt"],
                statusCode: 200,
                metadata: { softDelete: true },
            });
            socketService_1.socketService.emitToTenant(req.tenantId, "ticket:deleted", { id, isSoftDelete: true });
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
                isDeleted: false,
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
                        createdBy: { select: { name: true, workEmail: true, avatarUrl: true } },
                        assignee: { select: { name: true, workEmail: true, avatarUrl: true } },
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
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.TICKETS,
                page: transactionHistory_1.Page.TICKET_LIST,
                action: transactionHistory_1.Action.BULK_UPDATE_STATUS,
                actionLabel: `Bulk status -> ${status} (${result.count})`,
                entityType: transactionHistory_1.EntityType.TICKET,
                afterData: { status },
                changedFields: ["status"],
                correlationId: (0, crypto_1.randomUUID)(),
                metadata: { targetIds: ticketIds, requested: ticketIds.length, updated: result.count },
                statusCode: 200,
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
     * Bulk archive tickets (tenant-aware)
     */
    static async bulkArchive(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { ticketIds } = req.body;
            if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
                res.status(400).json({
                    success: false,
                    error: "Ticket IDs array is required",
                });
                return;
            }
            const result = await database_1.prisma.ticket.updateMany({
                where: {
                    id: { in: ticketIds },
                    tenantId: req.tenantId,
                },
                data: {
                    isArchived: true,
                    archivedAt: new Date(),
                    archivedById: req.user.id,
                    updatedAt: new Date(),
                },
            });
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.TICKETS,
                page: transactionHistory_1.Page.TICKET_LIST,
                action: transactionHistory_1.Action.BULK_ARCHIVE,
                actionLabel: `Bulk archive (${result.count})`,
                entityType: transactionHistory_1.EntityType.TICKET,
                afterData: { isArchived: true },
                changedFields: ["isArchived"],
                correlationId: (0, crypto_1.randomUUID)(),
                metadata: { targetIds: ticketIds, requested: ticketIds.length, updated: result.count },
                statusCode: 200,
            });
            res.status(200).json({
                success: true,
                data: { updatedCount: result.count },
                message: `${result.count} tickets archived successfully`,
            });
        }
        catch (error) {
            console.error("Bulk archive error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to archive tickets",
            });
        }
    }
    /**
     * Bulk unarchive tickets (tenant-aware)
     */
    static async bulkUnarchive(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { ticketIds } = req.body;
            if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
                res.status(400).json({
                    success: false,
                    error: "Ticket IDs array is required",
                });
                return;
            }
            const result = await database_1.prisma.ticket.updateMany({
                where: {
                    id: { in: ticketIds },
                    tenantId: req.tenantId,
                },
                data: {
                    isArchived: false,
                    archivedAt: null,
                    archivedById: null,
                    updatedAt: new Date(),
                },
            });
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.ARCHIVED,
                page: transactionHistory_1.Page.ARCHIVED_VIEW,
                action: transactionHistory_1.Action.BULK_UNARCHIVE,
                actionLabel: `Tickets restored from archive (${result.count})`,
                entityType: transactionHistory_1.EntityType.TICKET,
                afterData: { isArchived: false },
                changedFields: ["isArchived"],
                correlationId: (0, crypto_1.randomUUID)(),
                metadata: { targetIds: ticketIds, requested: ticketIds.length, updated: result.count },
                statusCode: 200,
            });
            res.status(200).json({
                success: true,
                data: { updatedCount: result.count },
                message: `${result.count} tickets restored successfully`,
            });
        }
        catch (error) {
            console.error("Bulk unarchive error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to restore tickets",
            });
        }
    }
    /**
     * Bulk delete tickets (tenant-aware)
     */
    static async bulkDelete(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { ticketIds } = req.body;
            if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
                res.status(400).json({
                    success: false,
                    error: "Ticket IDs array is required",
                });
                return;
            }
            const result = await database_1.prisma.ticket.updateMany({
                where: {
                    id: { in: ticketIds },
                    tenantId: req.tenantId,
                },
                data: {
                    isDeleted: true,
                    deletedAt: new Date(),
                    deletedById: req.user.id,
                    updatedAt: new Date(),
                },
            });
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.TICKETS,
                page: transactionHistory_1.Page.TICKET_LIST,
                action: transactionHistory_1.Action.BULK_DELETE,
                actionLabel: `Bulk move to trash (${result.count})`,
                entityType: transactionHistory_1.EntityType.TICKET,
                afterData: { isDeleted: true },
                changedFields: ["isDeleted", "deletedAt"],
                correlationId: (0, crypto_1.randomUUID)(),
                metadata: { targetIds: ticketIds, requested: ticketIds.length, updated: result.count, softDelete: true },
                statusCode: 200,
            });
            res.status(200).json({
                success: true,
                data: { deletedCount: result.count },
                message: `${result.count} tickets moved to trash`,
            });
        }
        catch (error) {
            console.error("Bulk delete error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to delete tickets",
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
                    isDeleted: false,
                },
                _count: true,
            });
            const totalTickets = await database_1.prisma.ticket.count({
                where: { projectId, tenantId: req.tenantId, isDeleted: false },
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
                    isDeleted: false,
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
                            avatarUrl: true,
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
                    isDeleted: false,
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
                            avatarUrl: true,
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
                    details: {
                        commentId: newComment.id,
                        contentPreview: comment.trim().substring(0, 50) + (comment.trim().length > 50 ? "..." : "")
                    },
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
                    isDeleted: false,
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
                    isDeleted: false,
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
                    isDeleted: false,
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
                    isDeleted: false,
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
                    isDeleted: false,
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
                            avatarUrl: true,
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
                    isDeleted: false,
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
            // Generate secure presigned URL for the uploaded file in response
            let signedUrl = fileUrl;
            try {
                const { generatePresignedUrl } = require("@/utils/r2Client");
                signedUrl = await generatePresignedUrl(fileUrl, 86400);
            }
            catch (e) {
                console.error("Failed to generate signed URL for uploaded attachment:", e);
            }
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
                data: {
                    ...attachment,
                    fileUrl: signedUrl,
                },
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
     * Rename ticket attachment (tenant-aware)
     */
    static async renameAttachment(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { ticketId, attachmentId } = req.params;
            const { newFileName } = req.body;
            if (!newFileName) {
                res.status(400).json({
                    success: false,
                    error: "New file name is required",
                });
                return;
            }
            // Verify ticket exists and belongs to tenant
            const ticket = await database_1.prisma.ticket.findFirst({
                where: {
                    id: ticketId,
                    tenantId: req.tenantId,
                    isDeleted: false,
                },
            });
            if (!ticket) {
                throw new types_1.NotFoundError("Ticket not found");
            }
            // Verify attachment exists and belongs to this ticket and tenant
            const attachment = await database_1.prisma.ticketAttachment.findFirst({
                where: {
                    id: attachmentId,
                    ticketId: ticketId,
                    tenantId: req.tenantId,
                },
            });
            if (!attachment) {
                throw new types_1.NotFoundError("Attachment not found");
            }
            const oldFileName = attachment.fileName;
            // Update attachment record
            const updatedAttachment = await database_1.prisma.ticketAttachment.update({
                where: { id: attachmentId },
                data: {
                    fileName: newFileName,
                    updatedAt: new Date(),
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
                    ticketId,
                    tenantId: req.tenantId,
                    action: "Attachment Renamed",
                    performedById: req.user.id,
                    details: { oldFileName, newFileName, attachmentId },
                },
            });
            res.status(200).json({
                success: true,
                data: updatedAttachment,
                message: "Attachment renamed successfully",
            });
        }
        catch (error) {
            console.error("Rename attachment error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to rename attachment",
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
            // Generate presigned URLs for secure access
            const attachmentsWithSignedUrls = await Promise.all(attachments.map(async (attachment) => {
                try {
                    const { generatePresignedUrl } = require("@/utils/r2Client");
                    const signedUrl = await generatePresignedUrl(attachment.fileUrl, 86400); // 24 hours expiry
                    return {
                        ...attachment,
                        fileUrl: signedUrl,
                    };
                }
                catch (e) {
                    console.error(`Failed to generate signed URL for attachment ${attachment.id}:`, e);
                    return attachment;
                }
            }));
            res.status(200).json({
                success: true,
                data: attachmentsWithSignedUrls,
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
                    isDeleted: false,
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
                isDeleted: false,
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
                    isDeleted: false,
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
                    isDeleted: false,
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