import { Response } from "express";
import { tenantAwarePrisma } from "@/config/database";
import { PrismaClient } from "@prisma/client";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from "@/types";
import dayjs from "dayjs";

export class DailyUpdateController {
  /**
   * Create new daily status update
   */
  static async createUpdate(req: AuthRequest, res: Response): Promise<void> {
    try {
    
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }
  console.log("request checking",req.body);
      const { mood, totalHoursWorked, projectUpdates, generalNotes, date} =
        req.body;


      // Validation
      if (
        !projectUpdates ||
        !Array.isArray(projectUpdates) ||
        projectUpdates.length === 0
      ) {
        res.status(400).json({
          success: false,
          error: "At least one project update is required",
        } as ApiResponse);
        return;
      }

      // Validate each project update (NEW STRUCTURE)
      for (const update of projectUpdates) {
        if (!update.projectId) {
          res.status(400).json({
            success: false,
            error: "Project ID is required for each update",
          } as ApiResponse);
          return;
        }

        // Validate time tracking
        if (!update.startTime || !update.endTime) {
          res.status(400).json({
            success: false,
            error: "Start time and end time are required for each project",
          } as ApiResponse);
          return;
        }

        // Validate time range
        const startTime = new Date(update.startTime);
        const endTime = new Date(update.endTime);
        if (endTime <= startTime) {
          res.status(400).json({
            success: false,
            error: "End time must be after start time",
          } as ApiResponse);
          return;
        }

        // Validate tasks array
        if (
          !update.tasks ||
          !Array.isArray(update.tasks) ||
          update.tasks.length === 0
        ) {
          res.status(400).json({
            success: false,
            error: "At least one task is required for each project",
          } as ApiResponse);
          return;
        }

        // Validate each task
        for (let i = 0; i < update.tasks.length; i++) {
          const task = update.tasks[i];

          // Validate task type
          if (!task.type || !["ticket", "manual"].includes(task.type)) {
            res.status(400).json({
              success: false,
              error: `Task #${
                i + 1
              }: Invalid task type. Must be 'ticket' or 'manual'`,
            } as ApiResponse);
            return;
          }

          // Validate ticket-based task
          if (task.type === "ticket" && !task.ticketId) {
            res.status(400).json({
              success: false,
              error: `Task #${
                i + 1
              }: Ticket ID is required for ticket-based tasks`,
            } as ApiResponse);
            return;
          }

          // Validate manual task
          if (
            task.type === "manual" &&
            (!task.description || !task.description.trim())
          ) {
            res.status(400).json({
              success: false,
              error: `Task #${i + 1}: Description is required for manual tasks`,
            } as ApiResponse);
            return;
          }

          // Validate status
          if (!task.status) {
            res.status(400).json({
              success: false,
              error: `Task #${i + 1}: Status is required`,
            } as ApiResponse);
            return;
          }

          const validStatuses = [
            "pending",
            "in_progress",
            "dev_complete",
            "in_testing",
            "pushed_to_staging",
            "pushed_to_production",
          ];
          if (!validStatuses.includes(task.status)) {
            res.status(400).json({
              success: false,
              error: `Task #${i + 1}: Invalid status`,
            } as ApiResponse);
            return;
          }
        }

        // Calculate hours worked if not provided
        if (!update.hoursWorked) {
          const diffMs = endTime.getTime() - startTime.getTime();
          update.hoursWorked =
            Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
        }
      }

      // Calculate total hours worked
      const calculatedTotalHours = projectUpdates.reduce(
        (sum: number, update: any) => {
          return sum + (update.hoursWorked || 0);
        },
        0
      );

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const result = await tenantAwarePrisma.withTenant(
        req.tenantId,
        async (client) => {
          // Check if user already submitted today
          // const existing = await client.statusUpdate.findFirst({
          //   where: {
          //     userId: req.user!.id,
          //     tenantId: req.tenantId,
          //     date: today,
          //   },
          // });

          // if (existing) {
          //   throw new ValidationError('You have already submitted an update for today. Please edit the existing one.');
          // }
          // const start = new Date(date);
          // start.setHours(0, 0, 0, 0);

          // const end = new Date(date);
          // end.setHours(23, 59, 59, 999);

          // const updates = await client.statusUpdate.findMany({
          //   where: {
          //     userId: req.user!.id,
          //     tenantId: req.tenantId,
          //     date: {
          //       gte: dayjs(date).startOf("day").toDate(),
          //       lte: dayjs(date).endOf("day").toDate(),
          //     },
          //   },
          //   orderBy: { submittedAt: "asc" },
          // });
          function startOfDay(date: Date) {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            return d;
          }

          function endOfDay(date: Date) {
            const d = new Date(date);
            d.setHours(23, 59, 59, 999);
            return d;
          }
          const today = new Date(); // this is a valid Date object

          const updates = await client.statusUpdate.findMany({
            where: {
              userId: req.user!.id,
              tenantId: req.tenantId,
              date: {
                gte: startOfDay(today),
                lte: endOfDay(today),
              },
            },
            orderBy: { submittedAt: "asc" },
          });

          // Verify all projects exist and user has access
          for (const update of projectUpdates) {
            const project = await client.project.findFirst({
              where: {
                id: update.projectId,
                tenantId: req.tenantId,
              },
            });

            if (!project) {
              throw new ValidationError(
                `Project not found: ${update.projectId}`
              );
            }

            // Check if user is member or PM of the project
            const isMember = await client.projectMember.findFirst({
              where: {
                projectId: update.projectId,
                userId: req.user!.id,
              },
            });

            const isProjectManager = project.projectManagerId === req.user!.id;

            if (!isMember && !isProjectManager) {
              throw new ValidationError(
                `You are not a member of project: ${project.name}`
              );
            }
          }
          

          const now = new Date();

          // // submitted working date (from frontend or today)
          console.log("date****",date);

           const submittedDate = date ? new Date(date) : new Date();
           submittedDate.setHours(0, 0, 0, 0);
          console.log("submittedDate",submittedDate);
           console.log("date",date);


          // // today's date
           const todaydate = new Date();
           todaydate.setHours(0, 0, 0, 0);

            const tdy = new Date();

          // // todaydate.setHours(0, 0, 0, 0);
            
            const isMissed = submittedDate < todaydate;
            console.log("isMissed",isMissed)
            
            const missedUpdateAt = isMissed ? submittedDate : null;
            console.log("missedUpdateAt ",missedUpdateAt )

          // Working date selected by user
         

          const statusUpdate = await client.statusUpdate.create({
            data: {
              userId: req.user.id,
              tenantId: req.tenantId,

              date: submittedDate, // ✅ working day
              submittedAt: now, // ✅ submit time
              is_missed: isMissed, // ✅ FIXED
              missed_updateAt: missedUpdateAt,

              mood: mood || null,
              totalHoursWorked: totalHoursWorked || null,
              projectUpdates: projectUpdates,
              generalNotes: generalNotes || null,
            },

            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                  workEmail: true,
                },
              },
            },
          });

          return statusUpdate;
        }
      );

      res.status(201).json({
        success: true,
        data: result,
        message: "Daily update submitted successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Create daily update error:", error);

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to create daily update",
      } as ApiResponse);
    }
  }

  /**
   * Get current user's daily updates
   */
  static async getMyUpdates(req: AuthRequest, res: Response): Promise<void> {
    try {
     
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { date, startDate, endDate, limit = 30 } = req.query;

      const where: any = {
        userId: req.user.id,
        tenantId: req.tenantId,
      };
      // console.log("reqid",req);

      // Date range filter (priority over single date)
      if (startDate && endDate) {
        const start = new Date(startDate as string);
        const end = new Date(endDate as string);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        where.date = {
          gte: start,
          lte: end,
        };
      }
      // Single date filter (backward compatible)
      else if (date) {
        const targetDate = new Date(date as string);
        targetDate.setHours(0, 0, 0, 0);
        where.date = targetDate;
      }

      const updates = await tenantAwarePrisma.withTenant(
        req.tenantId,
        async (client: PrismaClient) => {
          return await client.statusUpdate.findMany({
            where,
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                  workEmail: true,
                },
              },
            },
            orderBy: { date: "desc" },
            take: Number(limit),
          });
        }
      );

      res.status(200).json({
        success: true,
        data: updates,
      } as ApiResponse);
    } catch (error) {
      console.error("Get my updates error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch your updates",
      } as ApiResponse);
    }
  }

  /**
   * Get team's daily updates (PM/Admin only)
   */
  static async getTeamUpdates(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { date, startDate, endDate, projectId, userId } = req.query;

      const updates = await tenantAwarePrisma.withTenant(
        req.tenantId,
        async (client) => {
          // Check user role and position
          const user = await client.user.findUnique({
            where: { id: req.user!.id },
            select: { role: true, position: true },
          });

          if (!user) {
            throw new NotFoundError("User not found");
          }

          let where: any = {
            tenantId: req.tenantId,
          };

          // Date range filter (priority over single date)
          if (startDate && endDate) {
            const start = new Date(startDate as string);
            const end = new Date(endDate as string);
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            where.date = {
              gte: start,
              lte: end,
            };
          }
          // Single date filter (backward compatible)
          else if (date) {
            const targetDate = new Date(date as string);
            targetDate.setHours(0, 0, 0, 0);
            where.date = targetDate;
          }
          // Default to today if no date filter
          else {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            where.date = today;
          }

          // Super Admin - can see all updates
          if (user.role === "super_admin") {
            // No additional filters needed
          }
          // Project Manager - can see updates from their projects
          else if (user.position === "Project Manager") {
            const managedProjects = await client.project.findMany({
              where: {
                tenantId: req.tenantId,
                projectManagerId: req.user!.id,
              },
              select: { id: true },
            });

            const projectIds = managedProjects.map((p) => p.id);

            if (projectIds.length === 0) {
              // PM has no projects, return empty
              return [];
            }

            // Filter updates that include these projects
            // Note: We'll need to filter in application code since projectUpdates is JSON
          }
          // Regular user - can only see own updates
          else {
            where.userId = req.user!.id;
          }

          // Apply additional filters
          if (userId) {
            where.userId = userId;
          }

          let allUpdates = await client.statusUpdate.findMany({
            where,
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                  workEmail: true,
                },
              },
            },
            orderBy: { submittedAt: "desc" },
          });

          // Filter by project if PM and projectId specified
          if (
            user.position === "Project Manager" &&
            user.role !== "super_admin"
          ) {
            const managedProjects = await client.project.findMany({
              where: {
                tenantId: req.tenantId,
                projectManagerId: req.user!.id,
              },
              select: { id: true },
            });

            const projectIds = managedProjects.map((p) => p.id);

            allUpdates = allUpdates.filter((update) => {
              const projectUpdates = update.projectUpdates as any[];
              return projectUpdates.some((pu) =>
                projectIds.includes(pu.projectId)
              );
            });
          }

          // Filter by specific project if requested
          if (projectId) {
            allUpdates = allUpdates.filter((update) => {
              const projectUpdates = update.projectUpdates as any[];
              return projectUpdates.some((pu) => pu.projectId === projectId);
            });
          }

          return allUpdates;
        }
      );

      res.status(200).json({
        success: true,
        data: updates,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get team updates error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to fetch team updates",
      } as ApiResponse);
    }
  }

  /**
   * Get today's updates (role-based)
   */
  static async getTodayUpdates(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const updates = await tenantAwarePrisma.withTenant(
        req.tenantId,
        async (client) => {
          const user = await client.user.findUnique({
            where: { id: req.user!.id },
            select: { role: true, position: true },
          });

          if (!user) {
            throw new NotFoundError("User not found");
          }

          let where: any = {
            tenantId: req.tenantId,
            date: today,
          };

          // Regular users only see their own
          if (
            user.role !== "super_admin" &&
            user.position !== "Project Manager"
          ) {
            where.userId = req.user!.id;
          }

          let allUpdates = await client.statusUpdate.findMany({
            where,
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                  workEmail: true,
                },
              },
            },
            orderBy: { submittedAt: "desc" },
          });

          // Filter for Project Managers
          if (
            user.position === "Project Manager" &&
            user.role !== "super_admin"
          ) {
            const managedProjects = await client.project.findMany({
              where: {
                tenantId: req.tenantId,
                projectManagerId: req.user!.id,
              },
              select: { id: true },
            });

            const projectIds = managedProjects.map((p) => p.id);

            allUpdates = allUpdates.filter((update) => {
              const projectUpdates = update.projectUpdates as any[];
              return projectUpdates.some((pu) =>
                projectIds.includes(pu.projectId)
              );
            });
          }

          return allUpdates;
        }
      );

      res.status(200).json({
        success: true,
        data: updates,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get today updates error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to fetch today's updates",
      } as ApiResponse);
    }
  }

  static async checkTodaySubmission(
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

      // 🔥 DISABLED CHECK – Always allow new submission
      res.status(200).json({
        success: true,
        submitted: false,
        data: null,
      } as ApiResponse);
    } catch (error) {
      console.error("Check today submission error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to check submission status",
      } as ApiResponse);
    }
  }

  /**
   * Get specific daily update by ID
   */
  static async getUpdateById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const update = await tenantAwarePrisma.withTenant(
        req.tenantId,
        async (client) => {
          const statusUpdate = await client.statusUpdate.findFirst({
            where: {
              id,
              tenantId: req.tenantId,
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                  workEmail: true,
                },
              },
            },
          });

          if (!statusUpdate) {
            throw new NotFoundError("Daily update not found4");
          }

          // Check access permissions
          const user = await client.user.findUnique({
            where: { id: req.user!.id },
            select: { role: true, position: true },
          });

          if (!user) {
            throw new NotFoundError("User not found");
          }

          // Owner can always see their own
          if (statusUpdate.userId === req.user!.id) {
            return statusUpdate;
          }

          // Super admin can see all
          if (user.role === "super_admin") {
            return statusUpdate;
          }

          // Project Manager can see if update includes their projects
          if (user.position === "Project Manager") {
            const managedProjects = await client.project.findMany({
              where: {
                tenantId: req.tenantId,
                projectManagerId: req.user!.id,
              },
              select: { id: true },
            });

            const projectIds = managedProjects.map((p) => p.id);
            const projectUpdates = statusUpdate.projectUpdates as any[];
            const hasAccess = projectUpdates.some((pu) =>
              projectIds.includes(pu.projectId)
            );

            if (hasAccess) {
              return statusUpdate;
            }
          }

          throw new ValidationError(
            "You do not have permission to view this update"
          );
        }
      );

      res.status(200).json({
        success: true,
        data: update,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get update by ID error:", error);

      if (error instanceof NotFoundError || error instanceof ValidationError) {
        res.status(error instanceof NotFoundError ? 404 : 403).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to fetch update",
      } as ApiResponse);
    }
  }
  static async updateUpdate(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { mood, totalHoursWorked, projectUpdates, generalNotes } = req.body;

      const result = await tenantAwarePrisma.withTenant(
        req.tenantId,
        async (client) => {
          const existing = await client.statusUpdate.findFirst({
            where: {
              id,
              tenantId: req.tenantId,
            },
          });

          if (!existing) {
            throw new NotFoundError("Daily update not found5");
          }

          // Only owner can update
          if (existing.userId !== req.user!.id) {
            throw new ValidationError(
              "You can only update your own daily updates"
            );
          }

          // Check if it's the same day
          // const today = new Date();
          // today.setHours(0, 0, 0, 0);

          // const updateDate = new Date(existing.date);
          // updateDate.setHours(0, 0, 0, 0);

          // if (updateDate.getTime() !== today.getTime()) {
          //   throw new ValidationError("You can only edit today's update");
          // }
          // ✅ 24 HOURS CHECK
          // const diffHours = dayjs().diff(dayjs(existing.createdAt), "hour");

          // if (diffHours >= 24) {
          //   throw new ValidationError("Edit window expired (24 hours)");
          // }
          const diffMs = Date.now() - new Date(existing.createdAt).getTime();
          const diffHours = diffMs / (1000 * 60 * 60);

          if (diffHours >= 24) {
            throw new ValidationError("Edit window expired (24 hours)");
          }

          // ✅ FIXED VALIDATION (IMPORTANT)
          if (projectUpdates) {
            if (!Array.isArray(projectUpdates) || projectUpdates.length === 0) {
              throw new ValidationError(
                "At least one project update is required"
              );
            }

            for (const update of projectUpdates) {
              if (!update.projectId) {
                throw new ValidationError("Project ID is required");
              }

              if (
                !update.tasks ||
                !Array.isArray(update.tasks) ||
                update.tasks.length === 0
              ) {
                throw new ValidationError(
                  "Each project must have at least one task"
                );
              }
            }
          }

          // Update the daily status update
          const updated = await client.statusUpdate.update({
            where: { id },
            data: {
              mood: mood !== undefined ? mood : existing.mood,
              totalHoursWorked:
                totalHoursWorked !== undefined
                  ? totalHoursWorked
                  : existing.totalHoursWorked,
              projectUpdates: projectUpdates || existing.projectUpdates,
              generalNotes:
                generalNotes !== undefined
                  ? generalNotes
                  : existing.generalNotes,
              updatedAt: new Date(),
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                  workEmail: true,
                },
              },
            },
          });

          return updated;
        }
      );

      res.status(200).json({
        success: true,
        data: result,
        message: "Daily update updated successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Update daily update error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to update daily update",
      } as ApiResponse);
    }
  }

  /**
   * Delete daily status update
   */
 static async deleteUpdate(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId || !req.user) {
       res.status(400).json({
        success: false,
        error: "Tenant context and authentication required",
      } as ApiResponse);
    }

    const { id } = req.params;

    await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
      console.log("Trying to delete ID:", id, "Tenant:", req.tenantId);

      // ✅ Use findUnique if id is unique
      const existing = await client.statusUpdate.findUnique({
        where: { id },
      });

      console.log("Existing record found:", existing);

      if (!existing) {
        return res.status(404).json({
          success: false,
          error: "Daily update not found",
        } as ApiResponse);
      }

      // ✅ Only owner can delete
      if (existing.userId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: "You can only delete your own daily updates",
        } as ApiResponse);
      }

      // ✅ Delete by unique id only
      await client.statusUpdate.delete({
        where: { id },
      });
    });

    // ✅ Success response
     res.status(200).json({
      success: true,
      message: "Daily update deleted successfully",
    } as ApiResponse);

  } catch (error: any) {
    console.error("Delete daily update error:", error);
     res.status(500).json({
      success: false,
      error: "Failed to delete daily update",
    } as ApiResponse);
  }
}

  /**
   * Get submission statistics (PM/Admin only)
   */
  static async getSubmissionStats(
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

      const { startDate, endDate, projectId } = req.query;

      const stats = await tenantAwarePrisma.withTenant(
        req.tenantId,
        async (client) => {
          const user = await client.user.findUnique({
            where: { id: req.user!.id },
            select: { role: true, position: true },
          });

          if (!user) {
            throw new NotFoundError("User not found");
          }

          // Only PM or Super Admin can access stats
          if (
            user.role !== "super_admin" &&
            user.position !== "Project Manager"
          ) {
            throw new ValidationError(
              "You do not have permission to view statistics"
            );
          }

          const start = startDate
            ? new Date(startDate as string)
            : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const end = endDate ? new Date(endDate as string) : new Date();

          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999);

          const where: any = {
            tenantId: req.tenantId,
            date: {
              gte: start,
              lte: end,
            },
          };

          const updates = await client.statusUpdate.findMany({
            where,
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                },
              },
            },
          });

          // Calculate statistics
          const totalSubmissions = updates.length;
          const uniqueUsers = new Set(updates.map((u) => u.userId)).size;
          const totalUsers = await client.user.count({
            where: { tenantId: req.tenantId, isActive: true },
          });

          const submissionRate =
            totalUsers > 0 ? (uniqueUsers / totalUsers) * 100 : 0;

          const totalHours = updates.reduce((sum, u) => {
            const hours = u.totalHoursWorked
              ? parseFloat(u.totalHoursWorked.toString())
              : 0;
            return sum + hours;
          }, 0);

          const avgHoursWorked =
            totalSubmissions > 0 ? totalHours / totalSubmissions : 0;

          return {
            totalSubmissions,
            uniqueUsers,
            totalUsers,
            submissionRate: Math.round(submissionRate * 100) / 100,
            avgHoursWorked: Math.round(avgHoursWorked * 100) / 100,
            dateRange: {
              start: start.toISOString(),
              end: end.toISOString(),
            },
          };
        }
      );

      res.status(200).json({
        success: true,
        data: stats,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get submission stats error:", error);

      if (error instanceof NotFoundError || error instanceof ValidationError) {
        res.status(error instanceof NotFoundError ? 404 : 403).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to fetch statistics",
      } as ApiResponse);
    }
  }
}
