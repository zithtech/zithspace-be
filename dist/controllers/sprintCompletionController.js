"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SprintCompletionController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
const socketService_1 = require("@/services/socketService");
const cacheService_1 = __importDefault(require("@/utils/cacheService"));
class SprintCompletionController {
    /**
     * Get sprint completion summary (tenant-aware)
     * Returns completed and pending tickets for a sprint, plus available destinations
     */
    static async getSprintCompletionSummary(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { sprintId } = req.params;
            // Verify sprint exists and belongs to tenant
            const sprint = await database_1.prisma.releasePlan.findFirst({
                where: {
                    id: sprintId,
                    tenantId: req.tenantId,
                    type: "sprint_plan",
                },
                select: {
                    id: true,
                    version: true,
                    status: true,
                    goal: true,
                    startDate: true,
                    endDate: true,
                    committedPoints: true,
                    completedPoints: true,
                    projectId: true,
                    project: {
                        select: { id: true, name: true, code: true },
                    },
                },
            });
            if (!sprint) {
                throw new types_1.NotFoundError("Sprint not found");
            }
            // Get all tickets in this sprint (excluding deleted ones)
            const tickets = await database_1.prisma.ticket.findMany({
                where: {
                    sprintPlanId: sprintId,
                    tenantId: req.tenantId,
                    isDeleted: false,
                    // Removed parentId: null to include subtasks in completion summary
                },
                select: {
                    id: true,
                    ticketNumber: true,
                    title: true,
                    status: true,
                    priority: true,
                    type: true,
                    storyPoint: true,
                    assignee: {
                        select: { id: true, name: true, workEmail: true },
                    },
                    createdAt: true,
                },
                orderBy: { createdAt: "asc" },
            });
            // Separate completed and pending tickets
            const completedTickets = tickets.filter((t) => t.status.toLowerCase() === "completed" || t.status.toLowerCase() === "live");
            const pendingTickets = tickets.filter((t) => t.status.toLowerCase() !== "completed" && t.status.toLowerCase() !== "live");
            // Get available sprints for destination (same project, status: planning or active)
            const availableSprints = await database_1.prisma.releasePlan.findMany({
                where: {
                    projectId: sprint.projectId,
                    tenantId: req.tenantId,
                    type: "sprint_plan",
                    status: { in: ["planning", "active"] },
                    id: { not: sprintId }, // Exclude current sprint
                },
                select: {
                    id: true,
                    version: true,
                    status: true,
                    goal: true,
                    startDate: true,
                    endDate: true,
                },
                orderBy: { createdAt: "desc" },
                take: 10, // Limit to recent sprints
            });
            // Get available buckets (project-specific and cross-project)
            const availableBuckets = await database_1.prisma.bucket.findMany({
                where: {
                    tenantId: req.tenantId,
                    OR: [
                        { projectId: sprint.projectId },
                        { projectId: null, isShared: true },
                    ],
                },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    color: true,
                    projectId: true,
                    isShared: true,
                },
                orderBy: { createdAt: "desc" },
            });
            // Calculate statistics
            const totalTickets = tickets.length;
            const totalCompleted = completedTickets.length;
            const totalPending = pendingTickets.length;
            const completionPercentage = totalTickets > 0 ? Math.round((totalCompleted / totalTickets) * 100) : 0;
            const totalPoints = tickets.reduce((sum, t) => sum + (t.storyPoint || 0), 0);
            const completedPoints = completedTickets.reduce((sum, t) => sum + (t.storyPoint || 0), 0);
            res.status(200).json({
                success: true,
                data: {
                    sprint,
                    tickets: {
                        completed: completedTickets,
                        pending: pendingTickets,
                    },
                    statistics: {
                        totalTickets,
                        totalCompleted,
                        totalPending,
                        completionPercentage,
                        totalPoints,
                        completedPoints,
                    },
                    availableDestinations: {
                        sprints: availableSprints,
                        buckets: availableBuckets,
                    },
                },
            });
        }
        catch (error) {
            console.error("Get sprint completion summary error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to fetch sprint completion summary",
            });
        }
    }
    /**
     * Bulk resolve sprint tickets (tenant-aware)
     * Moves tickets to specified destinations (sprint, bucket, backlog, or trash)
     */
    static async bulkResolveTickets(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { sprintId } = req.params;
            const { actions } = req.body;
            if (!actions || !Array.isArray(actions) || actions.length === 0) {
                res.status(400).json({
                    success: false,
                    error: "Actions array is required",
                });
                return;
            }
            // Verify sprint exists
            const sprint = await database_1.prisma.releasePlan.findFirst({
                where: {
                    id: sprintId,
                    tenantId: req.tenantId,
                    type: "sprint_plan",
                },
            });
            if (!sprint) {
                throw new types_1.NotFoundError("Sprint not found");
            }
            // Validate all ticket IDs exist and belong to this sprint
            const ticketIds = actions.map((a) => a.ticketId);
            const tickets = await database_1.prisma.ticket.findMany({
                where: {
                    id: { in: ticketIds },
                    sprintPlanId: sprintId,
                    tenantId: req.tenantId,
                    isDeleted: false,
                },
            });
            if (tickets.length !== ticketIds.length) {
                throw new types_1.ValidationError("Some tickets not found or do not belong to this sprint");
            }
            // Group actions by type for bulk processing
            const moveToSprintActions = actions.filter((a) => a.action === "move_to_sprint");
            const moveToBucketActions = actions.filter((a) => a.action === "move_to_bucket");
            const moveToBacklogActions = actions.filter((a) => a.action === "move_to_backlog");
            const moveToTrashActions = actions.filter((a) => a.action === "move_to_trash");
            // VALIDATION PHASE - Do ALL validation BEFORE transaction to avoid timeout
            // Validate destination sprints exist (if any)
            if (moveToSprintActions.length > 0) {
                const destinationSprintIds = [...new Set(moveToSprintActions.map(a => a.destinationId))];
                const validSprints = await database_1.prisma.releasePlan.findMany({
                    where: {
                        id: { in: destinationSprintIds },
                        tenantId: req.tenantId,
                        type: "sprint_plan",
                    },
                    select: { id: true, version: true },
                });
                if (validSprints.length !== destinationSprintIds.length) {
                    const foundIds = new Set(validSprints.map(s => s.id));
                    const missingIds = destinationSprintIds.filter(id => !foundIds.has(id));
                    throw new types_1.ValidationError(`Destination sprint(s) not found: ${missingIds.join(', ')}`);
                }
                // Store sprint data for metadata
                const sprintMap = new Map(validSprints.map(s => [s.id, s]));
                moveToSprintActions.forEach(action => {
                    action.sprintData = sprintMap.get(action.destinationId);
                });
            }
            // Validate destination buckets exist (if any)
            if (moveToBucketActions.length > 0) {
                const destinationBucketIds = [...new Set(moveToBucketActions.map(a => a.destinationId))];
                const validBuckets = await database_1.prisma.bucket.findMany({
                    where: {
                        id: { in: destinationBucketIds },
                        tenantId: req.tenantId,
                    },
                    select: { id: true, name: true },
                });
                if (validBuckets.length !== destinationBucketIds.length) {
                    const foundIds = new Set(validBuckets.map(b => b.id));
                    const missingIds = destinationBucketIds.filter(id => !foundIds.has(id));
                    throw new types_1.ValidationError(`Destination bucket(s) not found: ${missingIds.join(', ')}`);
                }
                // Store bucket data for metadata
                const bucketMap = new Map(validBuckets.map(b => [b.id, b]));
                moveToBucketActions.forEach(action => {
                    action.bucketData = bucketMap.get(action.destinationId);
                });
            }
            // TRANSACTION PHASE - Use bulk operations for speed
            const results = await database_1.prisma.$transaction(async (tx) => {
                const now = new Date();
                const allLogs = [];
                const allUpdates = [];
                // BULK PROCESS: Move to Sprint (group by destination)
                if (moveToSprintActions.length > 0) {
                    // Group by destination sprint
                    const byDestination = new Map();
                    moveToSprintActions.forEach(action => {
                        if (!action.destinationId) {
                            throw new types_1.ValidationError("Destination sprint ID required");
                        }
                        if (!byDestination.has(action.destinationId)) {
                            byDestination.set(action.destinationId, []);
                        }
                        byDestination.get(action.destinationId).push(action);
                    });
                    // Bulk update and log for each destination
                    for (const [destSprintId, actionsGroup] of byDestination) {
                        const ticketIds = actionsGroup.map(a => a.ticketId);
                        const sprintData = actionsGroup[0].sprintData;
                        // Bulk update tickets
                        await tx.ticket.updateMany({
                            where: { id: { in: ticketIds } },
                            data: {
                                sprintPlanId: destSprintId,
                                updatedAt: now,
                            },
                        });
                        // Bulk create logs
                        await tx.sprintCompletionLog.createMany({
                            data: ticketIds.map(ticketId => ({
                                tenantId: req.tenantId,
                                sprintPlanId: sprintId,
                                projectId: sprint.projectId,
                                ticketId,
                                action: "moved_to_sprint",
                                destinationId: destSprintId,
                                destinationType: "sprint",
                                performedById: req.user.id,
                                metadata: { targetSprintVersion: sprintData?.version || '' },
                            })),
                        });
                        ticketIds.forEach(ticketId => {
                            allUpdates.push({ ticketId, action: "moved_to_sprint", status: "success" });
                        });
                    }
                }
                // BULK PROCESS: Move to Bucket (group by destination)
                if (moveToBucketActions.length > 0) {
                    const byDestination = new Map();
                    moveToBucketActions.forEach(action => {
                        if (!action.destinationId) {
                            throw new types_1.ValidationError("Destination bucket ID required");
                        }
                        if (!byDestination.has(action.destinationId)) {
                            byDestination.set(action.destinationId, []);
                        }
                        byDestination.get(action.destinationId).push(action);
                    });
                    for (const [destBucketId, actionsGroup] of byDestination) {
                        const ticketIds = actionsGroup.map(a => a.ticketId);
                        const bucketData = actionsGroup[0].bucketData;
                        // Bulk update tickets
                        await tx.ticket.updateMany({
                            where: { id: { in: ticketIds } },
                            data: {
                                sprintPlanId: null,
                                bucketId: destBucketId,
                                updatedAt: now,
                            },
                        });
                        // Bulk create logs
                        await tx.sprintCompletionLog.createMany({
                            data: ticketIds.map(ticketId => ({
                                tenantId: req.tenantId,
                                sprintPlanId: sprintId,
                                projectId: sprint.projectId,
                                ticketId,
                                action: "moved_to_bucket",
                                destinationId: destBucketId,
                                destinationType: "bucket",
                                performedById: req.user.id,
                                metadata: { bucketName: bucketData?.name || '' },
                            })),
                        });
                        ticketIds.forEach(ticketId => {
                            allUpdates.push({ ticketId, action: "moved_to_bucket", status: "success" });
                        });
                    }
                }
                // BULK PROCESS: Move to Backlog
                if (moveToBacklogActions.length > 0) {
                    const ticketIds = moveToBacklogActions.map(a => a.ticketId);
                    // Bulk update tickets - Thoroughly clear all plan associations, unarchive, and remove from buckets
                    await tx.ticket.updateMany({
                        where: { id: { in: ticketIds } },
                        data: {
                            sprintPlanId: null,
                            releasePlanId: null,
                            demoPlanId: null,
                            isArchived: false,
                            archivedAt: null,
                            archivedById: null,
                            bucketId: null,
                            updatedAt: now,
                        },
                    });
                    // Bulk create logs
                    await tx.sprintCompletionLog.createMany({
                        data: ticketIds.map(ticketId => ({
                            tenantId: req.tenantId,
                            sprintPlanId: sprintId,
                            projectId: sprint.projectId,
                            ticketId,
                            action: "moved_to_backlog",
                            destinationId: null,
                            destinationType: "backlog",
                            performedById: req.user.id,
                            metadata: {},
                        })),
                    });
                    ticketIds.forEach(ticketId => {
                        allUpdates.push({ ticketId, action: "moved_to_backlog", status: "success" });
                    });
                }
                // BULK PROCESS: Move to Trash
                if (moveToTrashActions.length > 0) {
                    const ticketIds = moveToTrashActions.map(a => a.ticketId);
                    // Bulk update tickets
                    await tx.ticket.updateMany({
                        where: { id: { in: ticketIds } },
                        data: {
                            isDeleted: true,
                            deletedAt: now,
                            deletedById: req.user.id,
                            sprintPlanId: null,
                            updatedAt: now,
                        },
                    });
                    // Bulk create logs
                    await tx.sprintCompletionLog.createMany({
                        data: ticketIds.map(ticketId => ({
                            tenantId: req.tenantId,
                            sprintPlanId: sprintId,
                            projectId: sprint.projectId,
                            ticketId,
                            action: "moved_to_trash",
                            destinationId: null,
                            destinationType: "trash",
                            performedById: req.user.id,
                            metadata: {},
                        })),
                    });
                    ticketIds.forEach(ticketId => {
                        allUpdates.push({ ticketId, action: "moved_to_trash", status: "success" });
                    });
                }
                return { logs: allLogs, updates: allUpdates };
            });
            // Invalidate caches for all affected tickets
            const cachePromises = tickets.map((ticket) => cacheService_1.default.invalidateTicket(ticket.id, req.tenantId));
            await Promise.allSettled(cachePromises);
            // Emit socket events
            socketService_1.socketService.emitToTenant(req.tenantId, "sprint:tickets_resolved", {
                sprintId,
                updates: results.updates,
            });
            res.status(200).json({
                success: true,
                data: {
                    processedCount: results.updates.length,
                    updates: results.updates,
                },
                message: `Successfully processed ${results.updates.length} ticket(s)`,
            });
        }
        catch (error) {
            console.error("Bulk resolve tickets error:", error);
            if (error instanceof types_1.NotFoundError ||
                error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to resolve sprint tickets",
            });
        }
    }
    /**
     * Complete sprint with enhanced workflow (tenant-aware)
     * Validates all tickets are resolved before completion
     */
    static async completeSprint(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { sprintId } = req.params;
            const { force = false } = req.body;
            // Verify sprint exists and can be completed
            const sprint = await database_1.prisma.releasePlan.findFirst({
                where: {
                    id: sprintId,
                    tenantId: req.tenantId,
                    type: "sprint_plan",
                },
            });
            if (!sprint) {
                throw new types_1.NotFoundError("Sprint not found");
            }
            if (sprint.status === "completed") {
                res.status(400).json({
                    success: false,
                    error: "Sprint is already completed",
                });
                return;
            }
            // Check for unresolved tickets (still in this sprint)
            const unresolvedTickets = await database_1.prisma.ticket.count({
                where: {
                    sprintPlanId: sprintId,
                    tenantId: req.tenantId,
                    isDeleted: false,
                    NOT: {
                        status: { in: ['completed', 'live', 'COMPLETED', 'LIVE'] }
                    }
                },
            });
            if (unresolvedTickets > 0 && !force) {
                res.status(400).json({
                    success: false,
                    error: `Cannot complete sprint: ${unresolvedTickets} unresolved ticket(s) remaining. Please resolve all tickets first or use force=true.`,
                    data: { unresolvedCount: unresolvedTickets },
                });
                return;
            }
            // Calculate completed story points
            const completedTickets = await database_1.prisma.ticket.findMany({
                where: {
                    tenantId: req.tenantId,
                    OR: [
                        {
                            sprintPlanId: sprintId,
                            status: { in: ['completed', 'live', 'COMPLETED', 'LIVE'] }
                        },
                        // Include tickets that were moved but marked as completed
                        {
                            completedAt: {
                                gte: sprint.startDate || new Date(0),
                                lte: new Date(),
                            },
                        },
                    ],
                },
                select: { storyPoint: true },
            });
            const totalCompletedPoints = completedTickets.reduce((sum, t) => sum + (t.storyPoint || 0), 0);
            // Complete sprint and archive completed tickets in transaction
            const updatedSprint = await database_1.prisma.$transaction(async (tx) => {
                // Archive all completed/live tickets from this sprint
                await tx.ticket.updateMany({
                    where: {
                        sprintPlanId: sprintId,
                        tenantId: req.tenantId,
                        status: { in: ['completed', 'live', 'COMPLETED', 'LIVE'] },
                        isDeleted: false,
                    },
                    data: {
                        isArchived: true,
                        archivedAt: new Date(),
                        archivedById: req.user.id,
                        updatedAt: new Date(),
                    },
                });
                // Complete the sprint
                return await tx.releasePlan.update({
                    where: { id: sprintId },
                    data: {
                        status: "completed",
                        completedAt: new Date(),
                        completedPoints: totalCompletedPoints,
                        updatedAt: new Date(),
                    },
                });
            });
            // Emit socket event
            socketService_1.socketService.emitToTenant(req.tenantId, "sprint:completed", {
                sprintId,
                sprint: updatedSprint,
            });
            res.status(200).json({
                success: true,
                data: updatedSprint,
                message: "Sprint completed successfully",
            });
        }
        catch (error) {
            console.error("Complete sprint error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to complete sprint",
            });
        }
    }
    /**
     * Get sprint completion history/audit log (tenant-aware)
     */
    static async getSprintCompletionLog(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { sprintId } = req.params;
            const { page = 1, limit = 50 } = req.query;
            // Verify sprint exists
            const sprint = await database_1.prisma.releasePlan.findFirst({
                where: {
                    id: sprintId,
                    tenantId: req.tenantId,
                    type: "sprint_plan",
                },
            });
            if (!sprint) {
                throw new types_1.NotFoundError("Sprint not found");
            }
            const skip = (Number(page) - 1) * Number(limit);
            // Get completion logs
            const [logs, total] = await Promise.all([
                database_1.prisma.sprintCompletionLog.findMany({
                    where: {
                        sprintPlanId: sprintId,
                        tenantId: req.tenantId,
                    },
                    include: {
                        performedBy: {
                            select: { id: true, name: true, workEmail: true },
                        },
                    },
                    orderBy: { performedAt: "desc" },
                    skip,
                    take: Number(limit),
                }),
                database_1.prisma.sprintCompletionLog.count({
                    where: { sprintPlanId: sprintId, tenantId: req.tenantId },
                }),
            ]);
            const totalPages = Math.ceil(total / Number(limit));
            // Group by action type for summary
            const summary = {
                movedToSprint: logs.filter((l) => l.action === "moved_to_sprint").length,
                movedToBucket: logs.filter((l) => l.action === "moved_to_bucket").length,
                movedToBacklog: logs.filter((l) => l.action === "moved_to_backlog")
                    .length,
                movedToTrash: logs.filter((l) => l.action === "moved_to_trash").length,
            };
            res.status(200).json({
                success: true,
                data: {
                    logs,
                    summary,
                },
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
            console.error("Get sprint completion log error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to fetch sprint completion log",
            });
        }
    }
}
exports.SprintCompletionController = SprintCompletionController;
//# sourceMappingURL=sprintCompletionController.js.map