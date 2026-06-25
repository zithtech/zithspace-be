"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrashController = void 0;
const database_1 = require("@/config/database");
const socketService_1 = require("@/services/socketService");
const cacheService_1 = __importDefault(require("@/utils/cacheService"));
const transactionHistory_1 = require("@/utils/transactionHistory");
const crypto_1 = require("crypto");
class TrashController {
    /**
     * Get all deleted tickets (trash) for a tenant/project (tenant-aware)
     * Only returns tickets deleted within the last 7 days
     */
    static async getTrashTickets(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { page = 1, limit = 20, projectId, search, status, deletedBy, startDate, endDate, sortBy = "deletedAt", sortOrder = "desc", } = req.query;
            // Calculate 7 days ago
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            // Build filter
            const where = {
                tenantId: req.tenantId,
                isDeleted: true,
                deletedAt: {
                    gte: sevenDaysAgo, // Only tickets deleted within 7 days
                },
            };
            if (projectId)
                where.projectId = projectId;
            if (status)
                where.status = status;
            if (deletedBy)
                where.deletedById = deletedBy;
            if (startDate || endDate) {
                const start = startDate ? new Date(startDate) : sevenDaysAgo;
                const end = endDate ? new Date(endDate) : undefined;
                where.deletedAt = {
                    gte: start > sevenDaysAgo ? start : sevenDaysAgo,
                    ...(end ? { lte: end } : {}),
                };
            }
            if (search) {
                where.OR = [
                    { title: { contains: search, mode: "insensitive" } },
                    { ticketNumber: { contains: search, mode: "insensitive" } },
                ];
            }
            // Build sort object
            const orderBy = {};
            orderBy[sortBy] = sortOrder === "desc" ? "desc" : "asc";
            // Execute query with pagination
            const skip = (Number(page) - 1) * Number(limit);
            const [tickets, total, projectCountsRaw] = await Promise.all([
                database_1.prisma.ticket.findMany({
                    where,
                    select: {
                        id: true,
                        ticketNumber: true,
                        title: true,
                        status: true,
                        priority: true,
                        type: true,
                        deletedAt: true,
                        deletedBy: {
                            select: { id: true, name: true, workEmail: true, avatarUrl: true },
                        },
                        project: {
                            select: { id: true, name: true, code: true },
                        },
                        createdAt: true,
                    },
                    orderBy,
                    skip,
                    take: Number(limit),
                }),
                database_1.prisma.ticket.count({ where }),
                database_1.prisma.ticket.groupBy({
                    by: ["projectId"],
                    where: {
                        tenantId: req.tenantId,
                        isDeleted: true,
                        deletedAt: {
                            gte: sevenDaysAgo,
                        },
                    },
                    _count: {
                        id: true,
                    },
                }),
            ]);
            const projectCounts = projectCountsRaw
                .filter((pc) => pc.projectId !== null)
                .map((pc) => ({
                projectId: pc.projectId,
                count: pc._count.id,
            }));
            const totalAllTrash = projectCountsRaw.reduce((acc, pc) => acc + pc._count.id, 0);
            const totalPages = Math.ceil(total / Number(limit));
            // Calculate expiring soon count (< 2 days until auto-purge)
            const twoDaysFromNow = new Date();
            twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
            const expiringSoon = tickets.filter(ticket => {
                if (!ticket.deletedAt)
                    return false;
                const purgeDate = new Date(ticket.deletedAt);
                purgeDate.setDate(purgeDate.getDate() + 7);
                return purgeDate <= twoDaysFromNow;
            }).length;
            res.status(200).json({
                success: true,
                data: {
                    tickets,
                    pagination: {
                        page: Number(page),
                        limit: Number(limit),
                        total,
                        pages: totalPages,
                        hasNext: Number(page) < totalPages,
                        hasPrev: Number(page) > 1,
                    },
                    summary: {
                        total,
                        expiringSoon,
                        projectCounts,
                        totalAllTrash,
                    },
                },
            });
        }
        catch (error) {
            console.error("Get trash tickets error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch trash tickets",
            });
        }
    }
    /**
     * Move ticket(s) to trash (soft delete) (tenant-aware)
     */
    static async moveToTrash(req, res) {
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
            // Verify tickets exist and belong to tenant
            const tickets = await database_1.prisma.ticket.findMany({
                where: {
                    id: { in: ticketIds },
                    tenantId: req.tenantId,
                    isDeleted: false, // Don't re-delete already deleted tickets
                },
            });
            if (tickets.length === 0) {
                res.status(404).json({
                    success: false,
                    error: "No valid tickets found to delete",
                });
                return;
            }
            // Move to trash (soft delete)
            const result = await database_1.prisma.ticket.updateMany({
                where: {
                    id: { in: tickets.map((t) => t.id) },
                    tenantId: req.tenantId,
                },
                data: {
                    isDeleted: true,
                    deletedAt: new Date(),
                    deletedById: req.user.id,
                    updatedAt: new Date(),
                },
            });
            // Invalidate caches for each ticket
            const cachePromises = tickets.map((ticket) => Promise.allSettled([
                cacheService_1.default.invalidateTicket(ticket.id, req.tenantId),
                ticket.parentId
                    ? cacheService_1.default.invalidateTicket(ticket.parentId, req.tenantId)
                    : Promise.resolve(),
            ]));
            await Promise.allSettled(cachePromises);
            // Emit socket events
            tickets.forEach((ticket) => {
                socketService_1.socketService.emitToTenant(req.tenantId, "ticket:deleted", {
                    id: ticket.id,
                    isSoftDelete: true,
                });
            });
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.TRASH,
                page: transactionHistory_1.Page.TRASH_VIEW,
                action: transactionHistory_1.Action.BULK_DELETE,
                actionLabel: `Tickets moved to trash (${result.count})`,
                entityType: transactionHistory_1.EntityType.TICKET,
                beforeData: { isDeleted: false },
                afterData: { isDeleted: true },
                changedFields: ["isDeleted"],
                correlationId: (0, crypto_1.randomUUID)(),
                metadata: {
                    targetIds: tickets.map((t) => t.id),
                    requested: ticketIds.length,
                    movedToTrash: result.count,
                    softDelete: true,
                },
                statusCode: 200,
            });
            res.status(200).json({
                success: true,
                data: { deletedCount: result.count },
                message: `${result.count} ticket(s) moved to trash`,
            });
        }
        catch (error) {
            console.error("Move to trash error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to move tickets to trash",
            });
        }
    }
    /**
     * Restore ticket(s) from trash (tenant-aware)
     */
    static async restoreFromTrash(req, res) {
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
            // Verify tickets exist in trash and belong to tenant
            const tickets = await database_1.prisma.ticket.findMany({
                where: {
                    id: { in: ticketIds },
                    tenantId: req.tenantId,
                    isDeleted: true, // Only restore deleted tickets
                },
            });
            if (tickets.length === 0) {
                res.status(404).json({
                    success: false,
                    error: "No valid tickets found in trash to restore",
                });
                return;
            }
            // Restore from trash
            const result = await database_1.prisma.ticket.updateMany({
                where: {
                    id: { in: tickets.map((t) => t.id) },
                    tenantId: req.tenantId,
                },
                data: {
                    isDeleted: false,
                    deletedAt: null,
                    deletedById: null,
                    updatedAt: new Date(),
                },
            });
            // Invalidate caches for each ticket
            const cachePromises = tickets.map((ticket) => Promise.allSettled([
                cacheService_1.default.invalidateTicket(ticket.id, req.tenantId),
                ticket.parentId
                    ? cacheService_1.default.invalidateTicket(ticket.parentId, req.tenantId)
                    : Promise.resolve(),
            ]));
            await Promise.allSettled(cachePromises);
            // Emit socket events
            tickets.forEach((ticket) => {
                socketService_1.socketService.emitToTenant(req.tenantId, "ticket:restored", {
                    id: ticket.id,
                });
            });
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.TRASH,
                page: transactionHistory_1.Page.TRASH_VIEW,
                action: transactionHistory_1.Action.BULK_RESTORE,
                actionLabel: `Tickets restored from trash (${result.count})`,
                entityType: transactionHistory_1.EntityType.TICKET,
                beforeData: { isDeleted: true },
                afterData: { isDeleted: false },
                changedFields: ["isDeleted"],
                correlationId: (0, crypto_1.randomUUID)(),
                metadata: {
                    targetIds: tickets.map((t) => t.id),
                    requested: ticketIds.length,
                    restored: result.count,
                },
                statusCode: 200,
            });
            res.status(200).json({
                success: true,
                data: { restoredCount: result.count },
                message: `${result.count} ticket(s) restored from trash`,
            });
        }
        catch (error) {
            console.error("Restore from trash error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to restore tickets from trash",
            });
        }
    }
    /**
     * Permanently delete ticket(s) from trash (tenant-aware)
     * This action cannot be undone
     */
    static async permanentlyDelete(req, res) {
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
            // Verify tickets exist in trash and belong to tenant
            const tickets = await database_1.prisma.ticket.findMany({
                where: {
                    id: { in: ticketIds },
                    tenantId: req.tenantId,
                    isDeleted: true, // Only permanently delete from trash
                },
            });
            if (tickets.length === 0) {
                res.status(404).json({
                    success: false,
                    error: "No valid tickets found in trash to delete",
                });
                return;
            }
            // Use transaction for data consistency
            await database_1.prisma.$transaction(async (tx) => {
                // Delete all related data first (cascades will handle most, but explicit for clarity)
                const ticketIdsToDelete = tickets.map((t) => t.id);
                // Delete ticket comments
                await tx.ticketComment.deleteMany({
                    where: { ticketId: { in: ticketIdsToDelete } },
                });
                // Delete ticket workflow steps
                await tx.ticketWorkflowStep.deleteMany({
                    where: { ticketId: { in: ticketIdsToDelete } },
                });
                // Delete ticket attachments
                await tx.ticketAttachment.deleteMany({
                    where: { ticketId: { in: ticketIdsToDelete } },
                });
                // Delete ticket related links
                await tx.ticketRelatedLink.deleteMany({
                    where: { ticketId: { in: ticketIdsToDelete } },
                });
                // Delete ticket activity log
                await tx.ticketActivityLog.deleteMany({
                    where: { ticketId: { in: ticketIdsToDelete } },
                });
                // Delete time tracking entries
                await tx.timeTrackingEntry.deleteMany({
                    where: { ticketId: { in: ticketIdsToDelete } },
                });
                // Delete work entries
                await tx.work_entry.deleteMany({
                    where: { ticket_id: { in: ticketIdsToDelete } },
                });
                // Finally, delete the tickets themselves
                await tx.ticket.deleteMany({
                    where: { id: { in: ticketIdsToDelete } },
                });
            });
            // Invalidate caches
            const cachePromises = tickets.map((ticket) => Promise.allSettled([
                cacheService_1.default.invalidateTicket(ticket.id, req.tenantId),
                ticket.parentId
                    ? cacheService_1.default.invalidateTicket(ticket.parentId, req.tenantId)
                    : Promise.resolve(),
            ]));
            await Promise.allSettled(cachePromises);
            // Emit socket events
            tickets.forEach((ticket) => {
                socketService_1.socketService.emitToTenant(req.tenantId, "ticket:permanently_deleted", {
                    id: ticket.id,
                });
            });
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.TRASH,
                page: transactionHistory_1.Page.TRASH_VIEW,
                action: transactionHistory_1.Action.BULK_PERMANENT_DELETE,
                actionLabel: `Tickets permanently deleted (${tickets.length})`,
                entityType: transactionHistory_1.EntityType.TICKET,
                correlationId: (0, crypto_1.randomUUID)(),
                metadata: {
                    targetIds: tickets.map((t) => t.id),
                    requested: ticketIds.length,
                    deleted: tickets.length,
                },
                statusCode: 200,
            });
            res.status(200).json({
                success: true,
                data: { deletedCount: tickets.length },
                message: `${tickets.length} ticket(s) permanently deleted`,
            });
        }
        catch (error) {
            console.error("Permanently delete error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to permanently delete tickets",
            });
        }
    }
    /**
     * Empty trash - permanently delete all tickets in trash (tenant-aware)
     * Only deletes tickets older than 7 days or all if force=true
     */
    static async emptyTrash(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { force = false, projectId } = req.body;
            // Build filter
            const where = {
                tenantId: req.tenantId,
                isDeleted: true,
            };
            if (projectId)
                where.projectId = projectId;
            // If not forced, only delete tickets older than 7 days
            if (!force) {
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                where.deletedAt = {
                    lt: sevenDaysAgo,
                };
            }
            // Get tickets to delete
            const tickets = await database_1.prisma.ticket.findMany({
                where,
                select: { id: true, parentId: true },
            });
            if (tickets.length === 0) {
                res.status(200).json({
                    success: true,
                    data: { deletedCount: 0 },
                    message: "No tickets to delete",
                });
                return;
            }
            // Use transaction for data consistency
            await database_1.prisma.$transaction(async (tx) => {
                const ticketIdsToDelete = tickets.map((t) => t.id);
                // Delete all related data
                await tx.ticketComment.deleteMany({
                    where: { ticketId: { in: ticketIdsToDelete } },
                });
                await tx.ticketWorkflowStep.deleteMany({
                    where: { ticketId: { in: ticketIdsToDelete } },
                });
                await tx.ticketAttachment.deleteMany({
                    where: { ticketId: { in: ticketIdsToDelete } },
                });
                await tx.ticketRelatedLink.deleteMany({
                    where: { ticketId: { in: ticketIdsToDelete } },
                });
                await tx.ticketActivityLog.deleteMany({
                    where: { ticketId: { in: ticketIdsToDelete } },
                });
                // Delete time tracking entries
                await tx.timeTrackingEntry.deleteMany({
                    where: { ticketId: { in: ticketIdsToDelete } },
                });
                // Delete work entries
                await tx.work_entry.deleteMany({
                    where: { ticket_id: { in: ticketIdsToDelete } },
                });
                // Delete tickets
                await tx.ticket.deleteMany({
                    where: { id: { in: ticketIdsToDelete } },
                });
            });
            // Invalidate caches
            const cachePromises = tickets.map((ticket) => cacheService_1.default.invalidateTicket(ticket.id, req.tenantId));
            await Promise.allSettled(cachePromises);
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.TRASH,
                page: transactionHistory_1.Page.TRASH_VIEW,
                action: transactionHistory_1.Action.EMPTY_TRASH,
                actionLabel: `Trash emptied (${tickets.length} ticket${tickets.length === 1 ? "" : "s"})`,
                entityType: transactionHistory_1.EntityType.TICKET,
                correlationId: (0, crypto_1.randomUUID)(),
                metadata: {
                    deleted: tickets.length,
                    force,
                    projectId: projectId ?? null,
                },
                statusCode: 200,
            });
            res.status(200).json({
                success: true,
                data: { deletedCount: tickets.length },
                message: `Trash emptied: ${tickets.length} ticket(s) permanently deleted`,
            });
        }
        catch (error) {
            console.error("Empty trash error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to empty trash",
            });
        }
    }
    /**
     * Auto-purge old deleted tickets (called by cron job)
     * Permanently deletes tickets that have been in trash for more than 7 days
     */
    static async autoPurge(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            // Calculate cutoff date (7 days ago)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            // Get tickets to purge
            const tickets = await database_1.prisma.ticket.findMany({
                where: {
                    tenantId: req.tenantId,
                    isDeleted: true,
                    deletedAt: {
                        lt: sevenDaysAgo,
                    },
                },
                select: { id: true },
            });
            if (tickets.length === 0) {
                res.status(200).json({
                    success: true,
                    data: { purgedCount: 0 },
                    message: "No tickets to auto-purge",
                });
                return;
            }
            // Use transaction for data consistency
            await database_1.prisma.$transaction(async (tx) => {
                const ticketIdsToDelete = tickets.map((t) => t.id);
                // Delete all related data
                await tx.ticketComment.deleteMany({
                    where: { ticketId: { in: ticketIdsToDelete } },
                });
                await tx.ticketWorkflowStep.deleteMany({
                    where: { ticketId: { in: ticketIdsToDelete } },
                });
                await tx.ticketAttachment.deleteMany({
                    where: { ticketId: { in: ticketIdsToDelete } },
                });
                await tx.ticketRelatedLink.deleteMany({
                    where: { ticketId: { in: ticketIdsToDelete } },
                });
                await tx.ticketActivityLog.deleteMany({
                    where: { ticketId: { in: ticketIdsToDelete } },
                });
                // Delete tickets
                await tx.ticket.deleteMany({
                    where: { id: { in: ticketIdsToDelete } },
                });
            });
            console.log(`Auto-purge completed for tenant ${req.tenantId}: ${tickets.length} tickets deleted`);
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.TRASH,
                page: transactionHistory_1.Page.TRASH_VIEW,
                action: transactionHistory_1.Action.AUTO_PURGE,
                actionLabel: `Auto-purge (${tickets.length} ticket${tickets.length === 1 ? "" : "s"} older than 7 days)`,
                entityType: transactionHistory_1.EntityType.TICKET,
                correlationId: (0, crypto_1.randomUUID)(),
                actorType: "system",
                metadata: { purged: tickets.length, cutoffDays: 7 },
                statusCode: 200,
            });
            res.status(200).json({
                success: true,
                data: { purgedCount: tickets.length },
                message: `Auto-purge completed: ${tickets.length} ticket(s) permanently deleted`,
            });
        }
        catch (error) {
            console.error("Auto-purge error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to auto-purge old tickets",
            });
        }
    }
}
exports.TrashController = TrashController;
//# sourceMappingURL=trashController.js.map