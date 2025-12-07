import { Response } from "express";
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
  AuthorizationError,
  CreateProjectData,
  UpdateProjectData,
} from "@/types";

export class ProjectController {
  /**
   * Get all projects with filtering and pagination (tenant-aware)
   */
  static async getProjects(req: AuthRequest, res: Response): Promise<void> {
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
        search,
        status,
        projectManagerId,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;

      // Build filter query
      const where: any = {
        tenantId: req.tenantId,
      };

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: "insensitive" } },
          { description: { contains: search as string, mode: "insensitive" } },
          { code: { contains: search as string, mode: "insensitive" } },
        ];
      }

      if (status) where.status = status;
      if (projectManagerId) where.projectManagerId = projectManagerId;

      // Build sort object
      const orderBy: any = {};
      orderBy[sortBy as string] = sortOrder === "desc" ? "desc" : "asc";

      // Execute query with pagination
      const skip = (Number(page) - 1) * Number(limit);

      const [projects, total] = await Promise.all([
        await prisma.project.findMany({
          where,
          include: {
            projectManager: {
              select: { id: true, name: true, workEmail: true, position: true },
            },
            members: {
              select: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    workEmail: true,
                    position: true,
                  },
                },
              },
            },
            createdBy: {
              select: { id: true, name: true, workEmail: true },
            },
          },
          orderBy,
          skip,
          take: Number(limit),
        }),

        await prisma.project.count({ where }),
      ]);

      const totalPages = Math.ceil(total / Number(limit));

      res.status(200).json({
        success: true,
        data: projects,
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
      console.error("Get projects error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch projects",
      } as ApiResponse);
    }
  }

  /**
   * Get project by ID (tenant-aware)
   */
  static async getProjectById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;


      const project = await prisma.project.findFirst({
            where: {
              id,
              tenantId: req.tenantId,
            },
            include: {
              projectManager: {
                select: {
                  id: true,
                  name: true,
                  workEmail: true,
                  position: true,
                },
              },
              members: {
                select: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      workEmail: true,
                      position: true,
                    },
                  },
                },
              },
              createdBy: {
                select: {
                  id: true,
                  name: true,
                  workEmail: true,
                  position: true,
                },
              },
            },
          });
        
      

      if (!project) {
        res.status(404).json({
          success: false,
          error: "Project not found",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: project,
      } as ApiResponse);
    } catch (error) {
      console.error("Get project by ID error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch project",
      } as ApiResponse);
    }
  }

  /**
   * Create a new project (tenant-aware)
   */
  static async createProject(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const {
        name,
        code,
        description,
        status = "ACTIVE",
        startDate,
        endDate,
        projectManagerId,
        teamMemberIds = [],
        repositories = [],
        workflowTemplate = [],
        defaultPriority = "MEDIUM",
      } = req.body as CreateProjectData;

      // Validate required fields
      if (!name || !description || !startDate || !projectManagerId) {
        res.status(400).json({
          success: false,
          error:
            "Missing required fields: name, description, startDate, projectManagerId",
        } as ApiResponse);
        return;
      }

      // Auto-generate code if not provided
      let projectCode = code;
      if (!projectCode) {
        const namePrefix = name
          .replace(/[^a-zA-Z]/g, "")
          .substring(0, 3)
          .toUpperCase();
        const timestamp = Date.now().toString().slice(-4);
        projectCode = `${namePrefix}${timestamp}`;
      }

      
        // Validate project manager exists and belongs to tenant
        const manager = await prisma.user.findFirst({
          where: {
            id: projectManagerId,
            tenantId: req.tenantId,
            isActive: true,
          },
        });

        if (!manager) {
          throw new ValidationError("Project manager not found in this tenant");
        }

        // Validate team members exist and belong to tenant
        if (teamMemberIds.length > 0) {
          const members = await prisma.user.findMany({
            where: {
              id: { in: teamMemberIds },
              tenantId: req.tenantId,
              isActive: true,
            },
          });

          if (members.length !== teamMemberIds.length) {
            throw new ValidationError(
              "One or more team members not found in this tenant"
            );
          }
        }

        // Check if project code already exists within tenant
        if (projectCode) {
          const existingProject = await prisma.project.findFirst({
            where: {
              code: projectCode.toUpperCase(),
              tenantId: req.tenantId,
            },
          });

          if (existingProject) {
            throw new ValidationError(
              "Project code already exists in this tenant"
            );
          }
        }

        // Create project with members
        const project = await prisma.project.create({
          data: {
            tenantId: req.tenantId,
            name,
            code: projectCode?.toUpperCase(),
            description,
            status,
            startDate: new Date(startDate),
            endDate: endDate ? new Date(endDate) : null,
            projectManagerId,
            repositories: repositories as any,
            workflowTemplate,
            defaultPriority,
            createdById: req.user!.id,
            members: {
              create: teamMemberIds.map((userId: string) => ({
                userId,
                role: "member",
              })),
            },
          },
          include: {
            projectManager: {
              select: { id: true, name: true, workEmail: true, position: true },
            },
            members: {
              select: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    workEmail: true,
                    position: true,
                  },
                },
              },
            },
            createdBy: {
              select: { id: true, name: true, workEmail: true },
            },
          },
        });

        res.status(201).json({
          success: true,
          data: project,
          message: "Project created successfully",
        } as ApiResponse);
   
    } catch (error: any) {
      console.error("Create project error:", error);

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      if (error.code === "P2002") {
        res.status(409).json({
          success: false,
          error: "Project with this code or name already exists",
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to create project",
      } as ApiResponse);
    }
  }

  /**
   * Update project (tenant-aware)
   */
  static async updateProject(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const updates = req.body as UpdateProjectData;

      // Remove fields that shouldn't be updated directly
      delete updates.createdById;
      delete updates.createdAt;
      delete updates.tenantId;

     
        // Check if project exists and belongs to tenant
        const existingProject = await prisma.project.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          },
        });

        if (!existingProject) {
          throw new NotFoundError("Project not found in this tenant");
        }

        // Validate project manager if provided
        if (updates.projectManagerId) {
          const manager = await prisma.user.findFirst({
            where: {
              id: updates.projectManagerId,
              tenantId: req.tenantId,
              isActive: true,
            },
          });

          if (!manager) {
            throw new ValidationError(
              "Project manager not found in this tenant"
            );
          }
        }

        // Check if project code already exists (if code is being updated)
        if (updates.code && updates.code !== existingProject.code) {
          const duplicateProject = await prisma.project.findFirst({
            where: {
              code: updates.code.toUpperCase(),
              tenantId: req.tenantId,
              id: { not: id },
            },
          });

          if (duplicateProject) {
            throw new ValidationError(
              "Project code already exists in this tenant"
            );
          }
          updates.code = updates.code.toUpperCase();
        }

        // Convert date strings to Date objects
        if (updates.startDate) updates.startDate = new Date(updates.startDate);
        if (updates.endDate) updates.endDate = new Date(updates.endDate);

        // Handle team members update
        let updateData: any = {
          ...updates,
          updatedAt: new Date(),
        };

        // If teamMemberIds is provided, handle the relationship update
        if (updates.teamMemberIds !== undefined) {
          // First remove all current team members
          await prisma.projectMember.deleteMany({
            where: { projectId: id },
          });

          // Then add the new team members if any
          if (updates.teamMemberIds.length > 0) {
            // Validate team members exist and belong to tenant
            const members = await prisma.user.findMany({
              where: {
                id: { in: updates.teamMemberIds },
                tenantId: req.tenantId,
                isActive: true,
              },
            });

            if (members.length !== updates.teamMemberIds.length) {
              throw new ValidationError(
                "One or more team members not found in this tenant"
              );
            }

            // Create new project member records
            await prisma.projectMember.createMany({
              data: updates.teamMemberIds.map((userId: string) => ({
                projectId: id,
                userId,
                role: "member",
              })),
            });
          }

          delete updateData.teamMemberIds; // Remove this as it's not a direct field
        }

        const project = await prisma.project.update({
          where: { id },
          data: updateData,
          include: {
            projectManager: {
              select: { id: true, name: true, workEmail: true, position: true },
            },
            members: {
              select: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    workEmail: true,
                    position: true,
                  },
                },
              },
            },
            createdBy: {
              select: { id: true, name: true, workEmail: true },
            },
          },
        });

        res.status(200).json({
          success: true,
          data: project,
          message: "Project updated successfully",
        } as ApiResponse);
   
    } catch (error: any) {
      console.error("Update project error:", error);

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
        error: "Failed to update project",
      } as ApiResponse);
    }
  }

  /**
   * Delete project (tenant-aware)
   */
  static async deleteProject(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

     
        const project = await prisma.project.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          },
        });

        if (!project) {
          throw new NotFoundError("Project not found in this tenant");
        }

        // Check if project has active tickets
        const activeTickets = await prisma.ticket.count({
          where: {
            projectId: id,
            tenantId: req.tenantId,
            status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
          },
        });

        if (activeTickets > 0) {
          throw new ValidationError(
            `Cannot delete project with ${activeTickets} active tickets. Please complete or reassign tickets first.`
          );
        }

        await prisma.project.delete({
          where: { id },
        });

        res.status(200).json({
          success: true,
          message: "Project deleted successfully",
        } as ApiResponse);
     
    } catch (error: any) {
      console.error("Delete project error:", error);

      if (error instanceof NotFoundError || error instanceof ValidationError) {
        res.status(error instanceof NotFoundError ? 404 : 400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to delete project",
      } as ApiResponse);
    }
  }

  /**
   * Get project statistics (tenant-aware)
   */
  static async getProjectStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;


          const project = await prisma.project.findFirst({
            where: {
              id,
              tenantId: req.tenantId,
            },
            select: {
              id: true,
              name: true,
              code: true,
              status: true,
            },
          });

          if (!project) {
            throw new NotFoundError("Project not found in this tenant");
          }

          // Get detailed ticket statistics
          const ticketStats = await prisma.ticket.groupBy({
            by: ["status", "priority"],
            where: {
              projectId: id,
              tenantId: req.tenantId,
            },
            _count: true,
          });

          // Get recent tickets
          const recentTickets = await prisma.ticket.findMany({
            where: {
              projectId: id,
              tenantId: req.tenantId,
            },
            include: {
              assignee: { select: { name: true, workEmail: true } },
              createdBy: { select: { name: true, workEmail: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          });

          // Calculate totals
          const totalTickets = await prisma.ticket.count({
            where: { projectId: id, tenantId: req.tenantId },
          });

          const completedTickets = await prisma.ticket.count({
            where: {
              projectId: id,
              tenantId: req.tenantId,
              status: "COMPLETED",
            },
          });

          const inProgressTickets = await prisma.ticket.count({
            where: {
              projectId: id,
              tenantId: req.tenantId,
              status: "IN_PROGRESS",
            },
          });

          const stats = {
            project: {
              ...project,
              totalTickets,
              completedTickets,
              inProgressTickets,
            },
            ticketStats,
            recentTickets,
          };


      res.status(200).json({
        success: true,
        data: stats,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get project stats error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to fetch project statistics",
      } as ApiResponse);
    }
  }

  /**
   * Get projects for dropdown/select (tenant-aware)
   */
  static async getProjectsForSelect(
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


          const projects =  await prisma.project.findMany({
            where: {
              tenantId: req.tenantId,
              status: "active",
            },
            select: {
              id: true,
              name: true,
              code: true,
              description: true,
            },
            orderBy: { name: "asc" },
          });

      const projectOptions = projects.map((project) => ({
        value: project.id,
        label: project.name,
        code: project.code,
        description: project.description,
      }));

      res.status(200).json({
        success: true,
        data: projectOptions,
      } as ApiResponse);
    } catch (error) {
      console.error("Get projects for select error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch projects for selection",
      } as ApiResponse);
    }
  }

  /**
   * Get projects where user is a member (tenant-aware)
   */
  static async getUserProjects(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const userId = req.user.id;


          const projects =  await prisma.project.findMany({
            where: {
              tenantId: req.tenantId,
              status: "active",
              OR: [
                { projectManagerId: userId },
                { members: { some: { userId: userId } } },
              ],
            },
            select: {
              id: true,
              name: true,
              code: true,
              description: true,
            },
            orderBy: { name: "asc" },
          });


      const projectOptions = projects.map((project) => ({
        value: project.id,
        label: project.name,
        code: project.code,
        description: project.description,
      }));

      res.status(200).json({
        success: true,
        data: projectOptions,
      } as ApiResponse);
    } catch (error) {
      console.error("Get user projects error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch user projects",
      } as ApiResponse);
    }
  }

  /**
   * Get projects where user is a member or project manager (for ticket creation)
   */
  static async getUserProjectsForTickets(
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

      const userId = req.user.id;

      const projects = 
           await prisma.project.findMany({
            where: {
              tenantId: req.tenantId,
              status: "active",
              OR: [
                { projectManagerId: userId },
                { members: { some: { userId: userId } } },
              ],
            },
            select: {
              id: true,
              name: true,
              code: true,
              description: true,
            },
            orderBy: { name: "asc" },
          });


      const projectOptions = projects.map((project) => ({
        value: project.id,
        label: project.name,
        code: project.code,
        description: project.description,
      }));

      res.status(200).json({
        success: true,
        data: projectOptions,
      } as ApiResponse);
    } catch (error) {
      console.error("Get user projects for tickets error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch user projects for tickets",
      } as ApiResponse);
    }
  }

  /**
   * Add team member to project (tenant-aware)
   */
  static async addTeamMember(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { userId } = req.body;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: "User ID is required",
        } as ApiResponse);
        return;
      }

      
        const [project, user] = await Promise.all([
          prisma.project.findFirst({
            where: { id, tenantId: req.tenantId },
            include: { members: true },
          }),
          prisma.user.findFirst({
            where: { id: userId, tenantId: req.tenantId, isActive: true },
          }),
        ]);

        if (!project) {
          throw new NotFoundError("Project not found in this tenant");
        }

        if (!user) {
          throw new NotFoundError("User not found in this tenant");
        }

        // Check if user is already a team member
        const isAlreadyMember = project.members.some(
          (member) => member.userId === userId
        );
        if (isAlreadyMember) {
          throw new ValidationError("User is already a team member");
        }

        // Add the team member
        await prisma.projectMember.create({
          data: {
            projectId: id,
            userId,
            role: "member",
          },
        });

        // Get updated project
        const updatedProject = await prisma.project.findFirst({
          where: { id },
          include: {
            members: {
              select: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    workEmail: true,
                    position: true,
                  },
                },
              },
            },
          },
        });

        res.status(200).json({
          success: true,
          data: updatedProject,
          message: "Team member added successfully",
        } as ApiResponse);
 
    } catch (error: any) {
      console.error("Add team member error:", error);

      if (error instanceof NotFoundError || error instanceof ValidationError) {
        res.status(error instanceof NotFoundError ? 404 : 400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to add team member",
      } as ApiResponse);
    }
  }

  /**
   * Get project members for dropdown/select (tenant-aware)
   */
  static async getProjectMembers(
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

      const { id } = req.params;

    
          const project = await prisma.project.findFirst({
            where: {
              id,
              tenantId: req.tenantId,
            },
            include: {
              projectManager: {
                select: {
                  id: true,
                  name: true,
                  workEmail: true,
                  position: true,
                },
              },
              members: {
                select: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      workEmail: true,
                      position: true,
                    },
                  },
                },
              },
            },
          });

          if (!project) {
            throw new NotFoundError("Project not found in this tenant");
          }

          // Combine project manager and team members
          const allMembers = [
            {
              value: project.projectManager.id,
              label: project.projectManager.name,
              position: project.projectManager.position,
              workEmail: project.projectManager.workEmail,
              isProjectManager: true,
            },
            ...project.members.map((member) => ({
              value: member.user.id,
              label: member.user.name,
              position: member.user.position,
              workEmail: member.user.workEmail,
              isProjectManager: false,
            })),
          ];

          // Remove duplicates (in case project manager is also in members list)
          const uniqueMembers = allMembers.filter(
            (member, index, self) =>
              index === self.findIndex((m) => m.value === member.value)
          );

            const members =  uniqueMembers;

      res.status(200).json({
        success: true,
        data: members,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get project members error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to fetch project members",
      } as ApiResponse);
    }
  }

  /**
   * Get tickets assigned to current user in a project (for daily updates)
   */
  static async getMyTicketsByProject(
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

      const { id } = req.params; // project ID

    
          // Verify project exists and user has access
          const project = await prisma.project.findFirst({
            where: {
              id,
              tenantId: req.tenantId,
            },
          });

          if (!project) {
            throw new NotFoundError("Project not found in this tenant");
          }

          // Get tickets assigned to current user in this project
            const tickets = await prisma.ticket.findMany({
            where: {
              projectId: id,
              tenantId: req.tenantId,
              assigneeId: req.user!.id,
            },
            select: {
              id: true,
              ticketNumber: true,
              title: true,
              status: true,
              priority: true,
            },
            orderBy: { ticketNumber: "desc" },
          });

      res.status(200).json({
        success: true,
        data: tickets,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get my tickets by project error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to fetch tickets for this project",
      } as ApiResponse);
    }
  }

  /**
   * Get all tickets for a project that user has access to (for daily updates)
   */
  static async getProjectTickets(
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

      const { id } = req.params; // project ID

      
          // Verify project exists and user has access
          const project = await prisma.project.findFirst({
            where: {
              id,
              tenantId: req.tenantId,
            },
            include: {
              members: {
                where: { userId: req.user!.id },
              },
            },
          });

          if (!project) {
            throw new NotFoundError("Project not found in this tenant");
          }

          // Check if user is project manager or member
          const isProjectManager = project.projectManagerId === req.user!.id;
          const isMember = project.members.length > 0;

          if (!isProjectManager && !isMember) {
            throw new AuthorizationError(
              "You do not have access to this project"
            );
          }

          // Get all tickets in this project
          const tickets =  await prisma.ticket.findMany({
            where: {
              projectId: id,
              tenantId: req.tenantId,
            },
            select: {
              id: true,
              ticketNumber: true,
              title: true,
              status: true,
              priority: true,
            },
            orderBy: { ticketNumber: "desc" },
          });


      res.status(200).json({
        success: true,
        data: tickets,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get project tickets error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      if (error instanceof AuthorizationError) {
        res.status(403).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to fetch project tickets",
      } as ApiResponse);
    }
  }

  /**
   * Remove team member from project (tenant-aware)
   */
  static async removeTeamMember(
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

      const { id, userId } = req.params;

     
        const project = await prisma.project.findFirst({
          where: { id, tenantId: req.tenantId },
          include: { members: true },
        });

        if (!project) {
          throw new NotFoundError("Project not found in this tenant");
        }

        // Check if user is actually a team member
        const isMember = project.members.some(
          (member) => member.userId === userId
        );
        if (!isMember) {
          throw new ValidationError(
            "User is not a team member of this project"
          );
        }

        // Remove the team member
        await prisma.projectMember.deleteMany({
          where: {
            projectId: id,
            userId: userId,
          },
        });

        // Get updated project
        const updatedProject = await prisma.project.findFirst({
          where: { id },
          include: {
            members: {
              select: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    workEmail: true,
                    position: true,
                  },
                },
              },
            },
          },
        });

        res.status(200).json({
          success: true,
          data: updatedProject,
          message: "Team member removed successfully",
        } as ApiResponse);
    
    } catch (error: any) {
      console.error("Remove team member error:", error);

      if (error instanceof NotFoundError || error instanceof ValidationError) {
        res.status(error instanceof NotFoundError ? 404 : 400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to remove team member",
      } as ApiResponse);
    }
  }
}

export default ProjectController;
