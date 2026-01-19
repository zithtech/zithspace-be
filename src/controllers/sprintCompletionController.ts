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

interface BulkResolveAction {
  ticketId: string;
  action: "move_to_sprint" | "move_to_bucket" | "move_to_backlog" | "move_to_trash";
  destinationId?: string; // Sprint ID or Bucket ID (optional for backlog/trash)
}

export class SprintCompletionController {
  /**
   * Get sprint completion summary (tenant-aware)
   * Returns completed and pending tickets for a sprint, plus available destinations
   */
  static async getSprintCompletionSummary(
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

      const { sprintId } = req.params;

      // Verify sprint exists and belongs to tenant
      const sprint = await prisma.releasePlan.findFirst({
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
        throw new NotFoundError("Sprint not found");
      }

      // Get all tickets in this sprint (excluding deleted ones)
      const tickets = await prisma.ticket.findMany({
        where: {
          sprintPlanId: sprintId,
          tenantId: req.tenantId,
          isDeleted: false,
          parentId: null, // Only parent tickets (not subtasks)
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
      const completedTickets = tickets.filter((t) => t.status === "completed");
      const pendingTickets = tickets.filter((t) => t.status !== "completed");

      // Get available sprints for destination (same project, status: planning or active)
      const availableSprints = await prisma.releasePlan.findMany({
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
      const availableBuckets = await prisma.bucket.findMany({
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
      const completionPercentage =
        totalTickets > 0 ? Math.round((totalCompleted / totalTickets) * 100) : 0;

      const totalPoints = tickets.reduce((sum, t) => sum + (t.storyPoint || 0), 0);
      const completedPoints = completedTickets.reduce(
        (sum, t) => sum + (t.storyPoint || 0),
        0
      );

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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get sprint completion summary error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to fetch sprint completion summary",
      } as ApiResponse);
    }
  }

  /**
   * Bulk resolve sprint tickets (tenant-aware)
   * Moves tickets to specified destinations (sprint, bucket, backlog, or trash)
   */
  static async bulkResolveTickets(
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

      const { sprintId } = req.params;
      const { actions } = req.body as { actions: BulkResolveAction[] };

      if (!actions || !Array.isArray(actions) || actions.length === 0) {
        res.status(400).json({
          success: false,
          error: "Actions array is required",
        } as ApiResponse);
        return;
      }

      // Verify sprint exists
      const sprint = await prisma.releasePlan.findFirst({
        where: {
          id: sprintId,
          tenantId: req.tenantId,
          type: "sprint_plan",
        },
      });

      if (!sprint) {
        throw new NotFoundError("Sprint not found");
      }

      // Validate all ticket IDs exist and belong to this sprint
      const ticketIds = actions.map((a) => a.ticketId);
      const tickets = await prisma.ticket.findMany({
        where: {
          id: { in: ticketIds },
          sprintPlanId: sprintId,
          tenantId: req.tenantId,
          isDeleted: false,
        },
      });

      if (tickets.length !== ticketIds.length) {
        throw new ValidationError(
          "Some tickets not found or do not belong to this sprint"
        );
      }

      // Group actions by type for bulk processing
      const moveToSprintActions = actions.filter(
        (a) => a.action === "move_to_sprint"
      );
      const moveToBucketActions = actions.filter(
        (a) => a.action === "move_to_bucket"
      );
      const moveToBacklogActions = actions.filter(
        (a) => a.action === "move_to_backlog"
      );
      const moveToTrashActions = actions.filter((a) => a.action === "move_to_trash");

      // Execute all actions in a transaction
      const results = await prisma.$transaction(async (tx) => {
        const logs: any[] = [];
        const updates: any[] = [];

        // Process move to sprint actions
        for (const action of moveToSprintActions) {
          if (!action.destinationId) {
            throw new ValidationError(
              "Destination sprint ID required for move_to_sprint action"
            );
          }

          // Verify destination sprint exists
          const destSprint = await tx.releasePlan.findFirst({
            where: {
              id: action.destinationId,
              tenantId: req.tenantId,
              type: "sprint_plan",
            },
          });

          if (!destSprint) {
            throw new ValidationError(
              `Destination sprint ${action.destinationId} not found`
            );
          }

          await tx.ticket.update({
            where: { id: action.ticketId },
            data: {
              sprintPlanId: action.destinationId,
              updatedAt: new Date(),
            },
          });

          // Create completion log
          const log = await tx.sprintCompletionLog.create({
            data: {
              tenantId: req.tenantId,
              sprintPlanId: sprintId,
              projectId: sprint.projectId,
              ticketId: action.ticketId,
              action: "moved_to_sprint",
              destinationId: action.destinationId,
              destinationType: "sprint",
              performedById: req.user!.id,
              metadata: { targetSprintVersion: destSprint.version },
            },
          });

          logs.push(log);
          updates.push({
            ticketId: action.ticketId,
            action: "moved_to_sprint",
            status: "success",
          });
        }

        // Process move to bucket actions
        for (const action of moveToBucketActions) {
          if (!action.destinationId) {
            throw new ValidationError(
              "Destination bucket ID required for move_to_bucket action"
            );
          }

          // Verify destination bucket exists
          const destBucket = await tx.bucket.findFirst({
            where: {
              id: action.destinationId,
              tenantId: req.tenantId,
            },
          });

          if (!destBucket) {
            throw new ValidationError(
              `Destination bucket ${action.destinationId} not found`
            );
          }

          await tx.ticket.update({
            where: { id: action.ticketId },
            data: {
              sprintPlanId: null, // Remove from sprint
              bucketId: action.destinationId,
              updatedAt: new Date(),
            },
          });

          // Create completion log
          const log = await tx.sprintCompletionLog.create({
            data: {
              tenantId: req.tenantId,
              sprintPlanId: sprintId,
              projectId: sprint.projectId,
              ticketId: action.ticketId,
              action: "moved_to_bucket",
              destinationId: action.destinationId,
              destinationType: "bucket",
              performedById: req.user!.id,
              metadata: { bucketName: destBucket.name },
            },
          });

          logs.push(log);
          updates.push({
            ticketId: action.ticketId,
            action: "moved_to_bucket",
            status: "success",
          });
        }

        // Process move to backlog actions
        for (const action of moveToBacklogActions) {
          await tx.ticket.update({
            where: { id: action.ticketId },
            data: {
              sprintPlanId: null, // Remove from sprint (moves to backlog)
              updatedAt: new Date(),
            },
          });

          // Create completion log
          const log = await tx.sprintCompletionLog.create({
            data: {
              tenantId: req.tenantId,
              sprintPlanId: sprintId,
              projectId: sprint.projectId,
              ticketId: action.ticketId,
              action: "moved_to_backlog",
              destinationId: null,
              destinationType: "backlog",
              performedById: req.user!.id,
              metadata: {},
            },
          });

          logs.push(log);
          updates.push({
            ticketId: action.ticketId,
            action: "moved_to_backlog",
            status: "success",
          });
        }

        // Process move to trash actions
        for (const action of moveToTrashActions) {
          await tx.ticket.update({
            where: { id: action.ticketId },
            data: {
              isDeleted: true,
              deletedAt: new Date(),
              deletedById: req.user!.id,
              sprintPlanId: null, // Remove from sprint
              updatedAt: new Date(),
            },
          });

          // Create completion log
          const log = await tx.sprintCompletionLog.create({
            data: {
              tenantId: req.tenantId,
              sprintPlanId: sprintId,
              projectId: sprint.projectId,
              ticketId: action.ticketId,
              action: "moved_to_trash",
              destinationId: null,
              destinationType: "trash",
              performedById: req.user!.id,
              metadata: {},
            },
          });

          logs.push(log);
          updates.push({
            ticketId: action.ticketId,
            action: "moved_to_trash",
            status: "success",
          });
        }

        return { logs, updates };
      });

      // Invalidate caches for all affected tickets
      const cachePromises = tickets.map((ticket) =>
        cacheService.invalidateTicket(ticket.id, req.tenantId)
      );
      await Promise.allSettled(cachePromises);

      // Emit socket events
      socketService.emitToTenant(req.tenantId, "sprint:tickets_resolved", {
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Bulk resolve tickets error:", error);

      if (
        error instanceof NotFoundError ||
        error instanceof ValidationError
      ) {
        res.status(400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to resolve sprint tickets",
      } as ApiResponse);
    }
  }

  /**
   * Complete sprint with enhanced workflow (tenant-aware)
   * Validates all tickets are resolved before completion
   */
  static async completeSprint(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { sprintId } = req.params;
      const { force = false } = req.body;

      // Verify sprint exists and can be completed
      const sprint = await prisma.releasePlan.findFirst({
        where: {
          id: sprintId,
          tenantId: req.tenantId,
          type: "sprint_plan",
        },
      });

      if (!sprint) {
        throw new NotFoundError("Sprint not found");
      }

      if (sprint.status === "completed") {
        res.status(400).json({
          success: false,
          error: "Sprint is already completed",
        } as ApiResponse);
        return;
      }

      // Check for unresolved tickets (still in this sprint)
      const unresolvedTickets = await prisma.ticket.count({
        where: {
          sprintPlanId: sprintId,
          tenantId: req.tenantId,
          status: { not: "completed" },
        },
      });

      if (unresolvedTickets > 0 && !force) {
        res.status(400).json({
          success: false,
          error: `Cannot complete sprint: ${unresolvedTickets} unresolved ticket(s) remaining. Please resolve all tickets first or use force=true.`,
          data: { unresolvedCount: unresolvedTickets },
        } as ApiResponse);
        return;
      }

      // Calculate completed story points
      const completedTickets = await prisma.ticket.findMany({
        where: {
          tenantId: req.tenantId,
          OR: [
            { sprintPlanId: sprintId, status: "completed" },
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

      const totalCompletedPoints = completedTickets.reduce(
        (sum, t) => sum + (t.storyPoint || 0),
        0
      );

      // Complete sprint
      const updatedSprint = await prisma.releasePlan.update({
        where: { id: sprintId },
        data: {
          status: "completed",
          completedAt: new Date(),
          completedPoints: totalCompletedPoints,
          updatedAt: new Date(),
        },
      });

      // Emit socket event
      socketService.emitToTenant(req.tenantId, "sprint:completed", {
        sprintId,
        sprint: updatedSprint,
      });

      res.status(200).json({
        success: true,
        data: updatedSprint,
        message: "Sprint completed successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Complete sprint error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to complete sprint",
      } as ApiResponse);
    }
  }

  /**
   * Get sprint completion history/audit log (tenant-aware)
   */
  static async getSprintCompletionLog(
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

      const { sprintId } = req.params;
      const { page = 1, limit = 50 } = req.query;

      // Verify sprint exists
      const sprint = await prisma.releasePlan.findFirst({
        where: {
          id: sprintId,
          tenantId: req.tenantId,
          type: "sprint_plan",
        },
      });

      if (!sprint) {
        throw new NotFoundError("Sprint not found");
      }

      const skip = (Number(page) - 1) * Number(limit);

      // Get completion logs
      const [logs, total] = await Promise.all([
        prisma.sprintCompletionLog.findMany({
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
        prisma.sprintCompletionLog.count({
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get sprint completion log error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to fetch sprint completion log",
      } as ApiResponse);
    }
  }
}
