import { Response } from "express";
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from "@/types";
import { socketService } from "@/services/socketService";
import cacheService from "@/utils/cacheService";

export class TrashController {
  /**
   * Get all deleted tickets (trash) for a tenant/project (tenant-aware)
   * Only returns tickets deleted within the last 7 days
   */
  static async getTrashTickets(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const {
        page = 1,
        limit = 20,
        projectId,
        search,
        sortBy = "deletedAt",
        sortOrder = "desc",
      } = req.query;

      // Calculate 7 days ago
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Build filter
      const where: any = {
        tenantId: req.tenantId,
        isDeleted: true,
        deletedAt: {
          gte: sevenDaysAgo, // Only tickets deleted within 7 days
        },
      };

      if (projectId) where.projectId = projectId;

      if (search) {
        where.OR = [
          { title: { contains: search as string, mode: "insensitive" } },
          { ticketNumber: { contains: search as string, mode: "insensitive" } },
        ];
      }

      // Build sort object
      const orderBy: any = {};
      orderBy[sortBy as string] = sortOrder === "desc" ? "desc" : "asc";

      // Execute query with pagination
      const skip = (Number(page) - 1) * Number(limit);

      const [tickets, total] = await Promise.all([
        prisma.ticket.findMany({
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
              select: { id: true, name: true, workEmail: true },
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
        prisma.ticket.count({ where }),
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
      } as ApiResponse);
    } catch (error) {
      console.error("Get trash tickets error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch trash tickets",
      } as ApiResponse);
    }
  }

  /**
   * Move ticket(s) to trash (soft delete) (tenant-aware)
   */
  static async moveToTrash(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { ticketIds } = req.body;

      if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
        res.status(400).json({
          success: false,
          error: "Ticket IDs array is required",
        } as ApiResponse);
        return;
      }

      // Verify tickets exist and belong to tenant
      const tickets = await prisma.ticket.findMany({
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
        } as ApiResponse);
        return;
      }

      // Move to trash (soft delete)
      const result = await prisma.ticket.updateMany({
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
      const cachePromises = tickets.map((ticket) =>
        Promise.allSettled([
          cacheService.invalidateTicket(ticket.id, req.tenantId),
          ticket.parentId
            ? cacheService.invalidateTicket(ticket.parentId, req.tenantId)
            : Promise.resolve(),
        ])
      );
      await Promise.allSettled(cachePromises);

      // Emit socket events
      tickets.forEach((ticket) => {
        socketService.emitToTenant(req.tenantId, "ticket:deleted", {
          id: ticket.id,
          isSoftDelete: true,
        });
      });

      res.status(200).json({
        success: true,
        data: { deletedCount: result.count },
        message: `${result.count} ticket(s) moved to trash`,
      } as ApiResponse);
    } catch (error) {
      console.error("Move to trash error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to move tickets to trash",
      } as ApiResponse);
    }
  }

  /**
   * Restore ticket(s) from trash (tenant-aware)
   */
  static async restoreFromTrash(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { ticketIds } = req.body;

      if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
        res.status(400).json({
          success: false,
          error: "Ticket IDs array is required",
        } as ApiResponse);
        return;
      }

      // Verify tickets exist in trash and belong to tenant
      const tickets = await prisma.ticket.findMany({
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
        } as ApiResponse);
        return;
      }

      // Restore from trash
      const result = await prisma.ticket.updateMany({
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
      const cachePromises = tickets.map((ticket) =>
        Promise.allSettled([
          cacheService.invalidateTicket(ticket.id, req.tenantId),
          ticket.parentId
            ? cacheService.invalidateTicket(ticket.parentId, req.tenantId)
            : Promise.resolve(),
        ])
      );
      await Promise.allSettled(cachePromises);

      // Emit socket events
      tickets.forEach((ticket) => {
        socketService.emitToTenant(req.tenantId, "ticket:restored", {
          id: ticket.id,
        });
      });

      res.status(200).json({
        success: true,
        data: { restoredCount: result.count },
        message: `${result.count} ticket(s) restored from trash`,
      } as ApiResponse);
    } catch (error) {
      console.error("Restore from trash error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to restore tickets from trash",
      } as ApiResponse);
    }
  }

  /**
   * Permanently delete ticket(s) from trash (tenant-aware)
   * This action cannot be undone
   */
  static async permanentlyDelete(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { ticketIds } = req.body;

      if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
        res.status(400).json({
          success: false,
          error: "Ticket IDs array is required",
        } as ApiResponse);
        return;
      }

      // Verify tickets exist in trash and belong to tenant
      const tickets = await prisma.ticket.findMany({
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
        } as ApiResponse);
        return;
      }

      // Use transaction for data consistency
      await prisma.$transaction(async (tx) => {
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

        // Finally, delete the tickets themselves
        await tx.ticket.deleteMany({
          where: { id: { in: ticketIdsToDelete } },
        });
      });

      // Invalidate caches
      const cachePromises = tickets.map((ticket) =>
        Promise.allSettled([
          cacheService.invalidateTicket(ticket.id, req.tenantId),
          ticket.parentId
            ? cacheService.invalidateTicket(ticket.parentId, req.tenantId)
            : Promise.resolve(),
        ])
      );
      await Promise.allSettled(cachePromises);

      // Emit socket events
      tickets.forEach((ticket) => {
        socketService.emitToTenant(req.tenantId, "ticket:permanently_deleted", {
          id: ticket.id,
        });
      });

      res.status(200).json({
        success: true,
        data: { deletedCount: tickets.length },
        message: `${tickets.length} ticket(s) permanently deleted`,
      } as ApiResponse);
    } catch (error) {
      console.error("Permanently delete error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to permanently delete tickets",
      } as ApiResponse);
    }
  }

  /**
   * Empty trash - permanently delete all tickets in trash (tenant-aware)
   * Only deletes tickets older than 7 days or all if force=true
   */
  static async emptyTrash(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { force = false, projectId } = req.body;

      // Build filter
      const where: any = {
        tenantId: req.tenantId,
        isDeleted: true,
      };

      if (projectId) where.projectId = projectId;

      // If not forced, only delete tickets older than 7 days
      if (!force) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        where.deletedAt = {
          lt: sevenDaysAgo,
        };
      }

      // Get tickets to delete
      const tickets = await prisma.ticket.findMany({
        where,
        select: { id: true, parentId: true },
      });

      if (tickets.length === 0) {
        res.status(200).json({
          success: true,
          data: { deletedCount: 0 },
          message: "No tickets to delete",
        } as ApiResponse);
        return;
      }

      // Use transaction for data consistency
      await prisma.$transaction(async (tx) => {
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

      // Invalidate caches
      const cachePromises = tickets.map((ticket) =>
        cacheService.invalidateTicket(ticket.id, req.tenantId)
      );
      await Promise.allSettled(cachePromises);

      res.status(200).json({
        success: true,
        data: { deletedCount: tickets.length },
        message: `Trash emptied: ${tickets.length} ticket(s) permanently deleted`,
      } as ApiResponse);
    } catch (error) {
      console.error("Empty trash error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to empty trash",
      } as ApiResponse);
    }
  }

  /**
   * Auto-purge old deleted tickets (called by cron job)
   * Permanently deletes tickets that have been in trash for more than 7 days
   */
  static async autoPurge(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      // Calculate cutoff date (7 days ago)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Get tickets to purge
      const tickets = await prisma.ticket.findMany({
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
        } as ApiResponse);
        return;
      }

      // Use transaction for data consistency
      await prisma.$transaction(async (tx) => {
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

      console.log(
        `Auto-purge completed for tenant ${req.tenantId}: ${tickets.length} tickets deleted`
      );

      res.status(200).json({
        success: true,
        data: { purgedCount: tickets.length },
        message: `Auto-purge completed: ${tickets.length} ticket(s) permanently deleted`,
      } as ApiResponse);
    } catch (error) {
      console.error("Auto-purge error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to auto-purge old tickets",
      } as ApiResponse);
    }
  }
}
