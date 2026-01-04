import { Response } from "express";
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from "@/types";

export class ReleasePlansController {
  /**
   * Get all release plans with filtering and pagination (tenant-aware)
   */
  static async getReleasePlans(req: AuthRequest, res: Response): Promise<void> {
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
        status,
        search,
        sortBy = "createdAt",
        sortOrder = "desc",
        type,
      } = req.query;

      // Build filter query
      const where: any = {
        tenantId: req.tenantId,
      };

      if (projectId) where.projectId = projectId;
      if (status) where.status = status;
      if (type) where.type = type;

      if (search) {
        where.OR = [
          { version: { contains: search as string, mode: "insensitive" } },
          { description: { contains: search as string, mode: "insensitive" } },
        ];
      }

      // Build sort object
      const orderBy: any = {};
      orderBy[sortBy as string] = sortOrder === "desc" ? "desc" : "asc";

      // Execute query with pagination
      const skip = (Number(page) - 1) * Number(limit);

      // Determine which relation to include based on type if specified, or include all for stats?
      // For list view stats, we need to know ticket counts.
      // Since a plan has ONE type, we can fetch all relations, but usually only one is populated.
      // However, Prisma relations for tickets are named: tickets (release), sprintTickets (sprint), demoTickets (demo).

      const [releasePlans, total] = await Promise.all([
        prisma.releasePlan.findMany({
          where,
          include: {
            project: {
              select: { id: true, name: true, code: true, description: true },
            },
            createdBy: {
              select: { id: true, name: true, workEmail: true },
            },
            // We include all 3 to calculate metrics correctly regardless of type
            tickets: { select: { status: true } },
            sprintTickets: { select: { status: true } },
            demoTickets: { select: { status: true } },
          },
          orderBy,
          skip,
          take: Number(limit),
        }),
        prisma.releasePlan.count({ where }),
      ]);

      const totalPages = Math.ceil(total / Number(limit));

      // Calculate progress metrics for each release plan
      const releasePlansWithMetrics = releasePlans.map((plan) => {
        // Determine which ticket set to use
        let relevantTickets: any[] = [];
        if (plan.type === 'sprint_plan') relevantTickets = plan.sprintTickets;
        else if (plan.type === 'demo_plan') relevantTickets = plan.demoTickets;
        else relevantTickets = plan.tickets;

        const totalTickets = relevantTickets.length || 0;
        const completedTickets = relevantTickets.filter((t) => t.status === "completed").length || 0;
        const inProgressTickets = relevantTickets.filter((t) => t.status === "in_progress").length || 0;
        const notStartedTickets = relevantTickets.filter((t) => ["not_started", "open"].includes(t.status)).length || 0;

        const progress = totalTickets > 0
          ? Math.round((completedTickets / totalTickets) * 100)
          : 0;

        // Remove the heavy arrays from response, return stats
        const { tickets, sprintTickets, demoTickets, ...planData } = plan;

        return {
          ...planData,
          name: plan.version,
          deadline: plan.releaseDate,
          priority: "Medium",
          totalTickets,
          completedTickets,
          inProgressTickets,
          notStartedTickets,
          progress,
        };
      });

      res.status(200).json({
        success: true,
        data: releasePlansWithMetrics,
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
      console.error("Get release plans error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch release plans",
      } as ApiResponse);
    }
  }

  /**
   * Get release plan by ID (tenant-aware)
   */
  static async getReleasePlanById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const releasePlan = await prisma.releasePlan.findFirst({
        where: {
          id,
          tenantId: req.tenantId,
        },
        include: {
          project: {
            select: { id: true, name: true, code: true, description: true },
          },
          createdBy: {
            select: { id: true, name: true, workEmail: true, position: true },
          },
          tickets: {
            select: {
              id: true, ticketNumber: true, title: true, status: true, priority: true, assigneeId: true, createdAt: true,
              assignee: { select: { id: true, name: true, workEmail: true } },
            },
            orderBy: { createdAt: "desc" },
          },
          sprintTickets: {
            select: {
              id: true, ticketNumber: true, title: true, status: true, priority: true, assigneeId: true, createdAt: true,
              assignee: { select: { id: true, name: true, workEmail: true } },
            },
            orderBy: { createdAt: "desc" },
          },
          demoTickets: {
            select: {
              id: true, ticketNumber: true, title: true, status: true, priority: true, assigneeId: true, createdAt: true,
              assignee: { select: { id: true, name: true, workEmail: true } },
            },
            orderBy: { createdAt: "desc" },
          }
        },
      });

      if (!releasePlan) {
        res.status(404).json({
          success: false,
          error: "Release plan not found",
        } as ApiResponse);
        return;
      }

      // Consolidate tickets based on type
      let relevantTickets: any[] = [];
      if (releasePlan.type === 'sprint_plan') relevantTickets = releasePlan.sprintTickets;
      else if (releasePlan.type === 'demo_plan') relevantTickets = releasePlan.demoTickets;
      else relevantTickets = releasePlan.tickets;

      const totalTickets = relevantTickets.length || 0;
      const completedTickets = relevantTickets.filter((t) => t.status === "completed").length || 0;

      const progress = totalTickets > 0 ? Math.round((completedTickets / totalTickets) * 100) : 0;

      // Clean up response
      const { tickets, sprintTickets, demoTickets, ...planData } = releasePlan;

      res.status(200).json({
        success: true,
        data: {
          ...planData,
          tickets: relevantTickets, // Send the correct list as 'tickets' for FE consistency
          name: releasePlan.version,
          deadline: releasePlan.releaseDate,
          priority: "Medium",
          totalTickets,
          completedTickets,
          progress
        },
      } as ApiResponse);
    } catch (error) {
      console.error("Get release plan by ID error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch release plan",
      } as ApiResponse);
    }
  }

  /**
   * Create new release plan (tenant-aware)
   */
  static async createReleasePlan(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const {
        version,
        description,
        projectId,
        releaseDate,
        startDate,
        endDate,
        goal,
        status = "planning",
        tickets, // Array of ticket IDs
        type = "release_plan"
      } = req.body;

      if (!version || !projectId) {
        res.status(400).json({
          success: false,
          error: "Version/Name and Project ID are required",
        } as ApiResponse);
        return;
      }

      // Create the plan
      const newReleasePlan = await prisma.releasePlan.create({
        data: {
          version,
          description,
          projectId,
          releaseDate: releaseDate ? new Date(releaseDate) : null,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          goal,
          status,
          type,
          tenantId: req.tenantId,
          createdById: req.user!.id,
          updatedAt: new Date(),
        },
      });

      // Assign tickets if provided
      if (tickets && Array.isArray(tickets) && tickets.length > 0) {
        const ticketUpdateData: any = { updatedAt: new Date() };

        if (type === "sprint_plan") {
          ticketUpdateData.sprintPlanId = newReleasePlan.id;
        } else if (type === "demo_plan") {
          ticketUpdateData.demoPlanId = newReleasePlan.id;
        } else {
          ticketUpdateData.releasePlanId = newReleasePlan.id;
        }

        await prisma.ticket.updateMany({
          where: {
            id: { in: tickets },
            tenantId: req.tenantId,
            projectId: projectId, // Ensure tickets belong to same project
          },
          data: ticketUpdateData,
        });
      }

      res.status(201).json({
        success: true,
        data: newReleasePlan,
        message: "Plan created successfully",
      } as ApiResponse);

    } catch (error: any) {
      console.error("Create release plan error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create release plan",
      } as ApiResponse);
    }
  }

  /**
   * Update release plan (tenant-aware)
   */
  static async updateReleasePlan(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const updates = req.body;
      const ticketsToAssign = updates.tickets;

      // Remove fields that shouldn't be updated directly via this generic object
      delete updates.tickets;
      delete updates.id;
      delete updates.tenantId;

      const existingPlan = await prisma.releasePlan.findUnique({
        where: { id, tenantId: req.tenantId }
      });

      if (!existingPlan) {
        throw new NotFoundError("Plan not found");
      }

      // Update basic fields
      await prisma.releasePlan.update({
        where: { id },
        data: {
          ...updates,
          updatedAt: new Date(),
        },
      });

      // Handle ticket re-assignment if 'tickets' array is provided
      if (ticketsToAssign !== undefined && Array.isArray(ticketsToAssign)) {
        const type = existingPlan.type;
        const resetData: any = { updatedAt: new Date() };
        const matchData: any = { tenantId: req.tenantId };

        // 1. Reset current assignments for this plan
        if (type === "sprint_plan") {
          matchData.sprintPlanId = id;
          resetData.sprintPlanId = null;
        } else if (type === "demo_plan") {
          matchData.demoPlanId = id;
          resetData.demoPlanId = null;
        } else {
          matchData.releasePlanId = id;
          resetData.releasePlanId = null;
        }

        await prisma.ticket.updateMany({
          where: matchData,
          data: resetData
        });

        // 2. Assign new tickets
        if (ticketsToAssign.length > 0) {
          const assignData: any = { updatedAt: new Date() };
          if (type === "sprint_plan") assignData.sprintPlanId = id;
          else if (type === "demo_plan") assignData.demoPlanId = id;
          else assignData.releasePlanId = id;

          await prisma.ticket.updateMany({
            where: {
              id: { in: ticketsToAssign },
              tenantId: req.tenantId
            },
            data: assignData
          });
        }
      }

      const updatedPlan = await prisma.releasePlan.findUnique({
        where: { id },
      });

      res.status(200).json({
        success: true,
        data: updatedPlan,
        message: "Plan updated successfully",
      } as ApiResponse);

    } catch (error: any) {
      console.error("Update plan error:", error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to update plan",
      } as ApiResponse);
    }
  }

  /**
   * Delete release plan (tenant-aware)
   */
  static async deleteReleasePlan(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const plan = await prisma.releasePlan.findUnique({
        where: { id, tenantId: req.tenantId }
      });

      if (!plan) {
        res.status(404).json({ success: false, error: "Plan not found" } as ApiResponse);
        return;
      }

      // Unassign tickets first
      const resetData: any = { updatedAt: new Date() };
      const matchData: any = { tenantId: req.tenantId };

      if (plan.type === "sprint_plan") {
        matchData.sprintPlanId = id;
        resetData.sprintPlanId = null;
      } else if (plan.type === "demo_plan") {
        matchData.demoPlanId = id;
        resetData.demoPlanId = null;
      } else {
        matchData.releasePlanId = id;
        resetData.releasePlanId = null;
      }

      await prisma.ticket.updateMany({
        where: matchData,
        data: resetData
      });

      await prisma.releasePlan.delete({
        where: { id },
      });

      res.status(200).json({
        success: true,
        message: "Plan deleted successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Delete plan error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete plan",
      } as ApiResponse);
    }
  }

  /**
   * Start a Sprint (tenant-aware)
   */
  static async startSprint(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const sprint = await prisma.releasePlan.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!sprint) {
        throw new NotFoundError("Sprint not found");
      }

      if (sprint.type !== "sprint_plan") {
        res.status(400).json({
          success: false,
          error: "Only sprint plans can be started",
        } as ApiResponse);
        return;
      }

      if (sprint.status === "active") {
        res.status(400).json({
          success: false,
          error: "Sprint is already active",
        } as ApiResponse);
        return;
      }

      if (sprint.status === "completed") {
        res.status(400).json({
          success: false,
          error: "Completed sprints cannot be restarted",
        } as ApiResponse);
        return;
      }

      // Check for other active sprints in the same project
      const activeSprint = await prisma.releasePlan.findFirst({
        where: {
          projectId: sprint.projectId,
          tenantId: req.tenantId,
          type: "sprint_plan",
          status: "active",
          id: { not: id },
        },
      });

      if (activeSprint) {
        res.status(400).json({
          success: false,
          error: "Another sprint is already active in this project. Complete it first.",
          data: { activeSprint },
        } as ApiResponse);
        return;
      }

      // Start the sprint
      const updatedSprint = await prisma.releasePlan.update({
        where: { id },
        data: {
          status: "active",
          startedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      res.status(200).json({
        success: true,
        data: updatedSprint,
        message: "Sprint started successfully",
      } as ApiResponse);

    } catch (error: any) {
      console.error("Start sprint error:", error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: "Failed to start sprint" } as ApiResponse);
    }
  }

  /**
   * Complete a Sprint (tenant-aware)
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

      const { id } = req.params;

      const sprint = await prisma.releasePlan.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!sprint) {
        throw new NotFoundError("Sprint not found");
      }

      if (sprint.type !== "sprint_plan") {
        res.status(400).json({
          success: false,
          error: "Only sprint plans can be completed",
        } as ApiResponse);
        return;
      }

      if (sprint.status !== "active") {
        res.status(400).json({
          success: false,
          error: "Only active sprints can be completed",
        } as ApiResponse);
        return;
      }

      // Calculate completed points based on srpint tickets
      const tickets = await prisma.ticket.findMany({
        where: { sprintPlanId: id, tenantId: req.tenantId },
        select: { status: true, storyPoint: true },
      });

      const completedPoints = tickets
        .filter((t) => t.status === "completed")
        .reduce((sum, t) => sum + (t.storyPoint || 0), 0);

      // Complete the sprint
      const updatedSprint = await prisma.releasePlan.update({
        where: { id },
        data: {
          status: "completed",
          completedAt: new Date(),
          completedPoints,
          updatedAt: new Date(),
        },
      });

      res.status(200).json({
        success: true,
        data: updatedSprint,
        message: "Sprint completed successfully",
      } as ApiResponse);

    } catch (error: any) {
      console.error("Complete sprint error:", error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: "Failed to complete sprint" } as ApiResponse);
    }
  }

  // -- Auxiliary methods --

  /**
   * Get active release plans
   */
  static async getActiveReleasePlans(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context required",
        } as ApiResponse);
        return;
      }
      const { projectId } = req.query;

      const where: any = { tenantId: req.tenantId, status: "active" };
      if (projectId) {
        where.projectId = projectId;
      }

      const activePlans = await prisma.releasePlan.findMany({
        where,
        include: { project: { select: { id: true, name: true, code: true } } },
        orderBy: { updatedAt: "desc" },
      });
      res.status(200).json({ success: true, data: activePlans } as ApiResponse);
    } catch (e) {
      res.status(500).json({ success: false, error: "Error" } as ApiResponse);
    }
  }

  static async getReleasePlanStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant required" } as ApiResponse);
        return;
      }

      // Get counts of active plans
      const [releasePlans, sprintPlans, demoPlans] = await Promise.all([
        prisma.releasePlan.count({ where: { tenantId: req.tenantId, type: 'release_plan', status: 'active' } }),
        prisma.releasePlan.count({ where: { tenantId: req.tenantId, type: 'sprint_plan', status: 'active' } }),
        prisma.releasePlan.count({ where: { tenantId: req.tenantId, type: 'demo_plan', status: 'active' } })
      ]);

      res.status(200).json({
        success: true,
        data: {
          activeReleasePlans: releasePlans,
          activeSprintPlans: sprintPlans,
          activeDemoPlans: demoPlans
        }
      } as ApiResponse);
    } catch (e) {
      console.error("Stats error", e);
      res.status(500).json({ success: false, error: "Error fetching stats" } as ApiResponse);
    }
  }

  static async getReleasePlansByProject(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) return;
      const { projectId } = req.params;
      const plans = await prisma.releasePlan.findMany({
        where: { projectId, tenantId: req.tenantId },
        orderBy: { createdAt: 'desc' }
      });
      res.status(200).json({ success: true, data: plans } as ApiResponse);
    } catch (e) {
      res.status(500).json({ success: false, error: "Error" } as ApiResponse);
    }
  }

  static async getProjectTickets(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) return;
      const { projectId } = req.params;
      const { search, limit = 50 } = req.query;

      const where: any = { projectId, tenantId: req.tenantId };
      if (search) where.title = { contains: String(search), mode: 'insensitive' };

      const tickets = await prisma.ticket.findMany({
        where,
        take: Number(limit),
        select: { id: true, ticketNumber: true, title: true, status: true, priority: true }
      });
      res.status(200).json({ success: true, data: tickets } as ApiResponse);
    } catch (e) {
      res.status(500).json({ success: false, error: "Error" } as ApiResponse);
    }
  }

  static async getAvailableTickets(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) return;
      const { projectId } = req.params; // Make sure route expects param or query
      const { search, limit = 50, excludeReleasePlan } = req.query;

      const where: any = { projectId, tenantId: req.tenantId };
      if (search) {
        where.OR = [
          { title: { contains: String(search), mode: 'insensitive' } },
          { ticketNumber: { contains: String(search), mode: 'insensitive' } }
        ];
      }

      // This is tricky. If we select "excludeReleasePlan", we usually mean "show tickets NOT in this plan".
      // BUT, a ticket can be in Release A, Sprint B, Demo C.
      // If I am editing Sprint B, I want to see tickets that are NOT in Sprint B (or any *other* sprint?? usually just *this* sprint).
      // The UI usually filters out `selectedTickets` purely on frontend if they are already in list.
      // But for backend query, we might want to exclude.
      // Given complexity, we will return ALL project tickets for now (filtered by search) and let FE exclude the ones it already has.
      // OR, excluding means "tickets not assigned to ANY release plan"?
      // No, with multi-plan, a ticket can be in many.

      const tickets = await prisma.ticket.findMany({
        where,
        take: Number(limit),
        select: {
          id: true, ticketNumber: true, title: true, status: true, priority: true, assignee: { select: { id: true, name: true } }
        }
      });

      res.status(200).json({ success: true, data: tickets } as ApiResponse);
    } catch (e) {
      res.status(500).json({ success: false, error: "Error" } as ApiResponse);
    }
  }

  static async assignTicketsToReleasePlan(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context required" } as ApiResponse);
        return;
      }
      const { id } = req.params;
      const { ticketIds } = req.body;

      if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
        res.status(400).json({ success: false, error: "Ticket IDs required" } as ApiResponse);
        return;
      }

      const plan = await prisma.releasePlan.findUnique({
        where: { id, tenantId: req.tenantId }
      });

      if (!plan) {
        res.status(404).json({ success: false, error: "Plan not found" } as ApiResponse);
        return;
      }

      const updateData: any = { updatedAt: new Date() };
      if (plan.type === 'sprint_plan') updateData.sprintPlanId = id;
      else if (plan.type === 'demo_plan') updateData.demoPlanId = id;
      else updateData.releasePlanId = id;

      await prisma.ticket.updateMany({
        where: {
          id: { in: ticketIds },
          tenantId: req.tenantId
        },
        data: updateData
      });

      res.status(200).json({ success: true, message: "Tickets assigned successfully" } as ApiResponse);
    } catch (error) {
      console.error("Assign tickets error:", error);
      res.status(500).json({ success: false, error: "Failed to assign tickets" } as ApiResponse);
    }
  }

  static async removeTicketsFromReleasePlan(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context required" } as ApiResponse);
        return;
      }
      const { id } = req.params;
      const { ticketIds } = req.body;

      if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
        res.status(400).json({ success: false, error: "Ticket IDs required" } as ApiResponse);
        return;
      }

      const plan = await prisma.releasePlan.findUnique({
        where: { id, tenantId: req.tenantId }
      });

      if (!plan) {
        res.status(404).json({ success: false, error: "Plan not found" } as ApiResponse);
        return;
      }

      const updateData: any = { updatedAt: new Date() };
      if (plan.type === 'sprint_plan') updateData.sprintPlanId = null;
      else if (plan.type === 'demo_plan') updateData.demoPlanId = null;
      else updateData.releasePlanId = null;

      await prisma.ticket.updateMany({
        where: {
          id: { in: ticketIds },
          tenantId: req.tenantId
        },
        data: updateData
      });

      res.status(200).json({ success: true, message: "Tickets removed successfully" } as ApiResponse);
    } catch (error) {
      console.error("Remove tickets error:", error);
      res.status(500).json({ success: false, error: "Failed to remove tickets" } as ApiResponse);
    }
  }
}

export default ReleasePlansController;
