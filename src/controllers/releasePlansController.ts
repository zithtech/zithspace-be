import { Response } from 'express';
import { tenantAwarePrisma } from '@/config/database';
import { 
  AuthRequest, 
  ApiResponse, 
  NotFoundError, 
  ValidationError
} from '@/types';

export class ReleasePlansController {
  /**
   * Get all release plans with filtering and pagination (tenant-aware)
   */
  static async getReleasePlans(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const {
        page = 1,
        limit = 20,
        projectId,
        status,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build filter query
      const where: any = {
        tenantId: req.tenantId,
      };

      if (projectId) where.projectId = projectId;
      if (status) where.status = status;

      if (search) {
        where.OR = [
          { version: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      // Build sort object
      const orderBy: any = {};
      orderBy[sortBy as string] = sortOrder === 'desc' ? 'desc' : 'asc';

      // Execute query with pagination
      const skip = (Number(page) - 1) * Number(limit);
      
      const [releasePlans, total] = await Promise.all([
        tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
          return await client.releasePlan.findMany({
            where,
            include: {
              project: {
                select: { id: true, name: true, code: true }
              },
              createdBy: {
                select: { id: true, name: true, workEmail: true }
              }
            },
            orderBy,
            skip,
            take: Number(limit),
          });
        }),
        tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
          return await client.releasePlan.count({ where });
        })
      ]);

      const totalPages = Math.ceil(total / Number(limit));

      res.status(200).json({
        success: true,
        data: releasePlans,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: totalPages,
          hasNext: Number(page) < totalPages,
          hasPrev: Number(page) > 1
        }
      } as ApiResponse);
    } catch (error) {
      console.error('Get release plans error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch release plans'
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
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const releasePlan = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        return await client.releasePlan.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          },
          include: {
            project: {
              select: { id: true, name: true, code: true }
            },
            createdBy: {
              select: { id: true, name: true, workEmail: true, position: true }
            },
            // Get associated tickets through the project relation
            tickets: {
              select: {
                id: true,
                title: true,
                status: true,
                priority: true,
                assigneeId: true,
                createdAt: true,
                assignee: {
                  select: { id: true, name: true, workEmail: true }
                }
              },
              orderBy: { createdAt: 'desc' }
            }
          }
        });
      });

      if (!releasePlan) {
        res.status(404).json({
          success: false,
          error: 'Release plan not found'
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: releasePlan
      } as ApiResponse);
    } catch (error) {
      console.error('Get release plan by ID error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch release plan'
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
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { version, description, projectId, releaseDate, status = 'planning' } = req.body;

      // Validate required fields
      if (!version || !description || !projectId) {
        res.status(400).json({
          success: false,
          error: 'Version, description, and project ID are required'
        } as ApiResponse);
        return;
      }

      // Validate release date if provided
      if (releaseDate) {
        const releaseDateObj = new Date(releaseDate);
        if (releaseDateObj <= new Date()) {
          res.status(400).json({
            success: false,
            error: 'Release date must be in the future'
          } as ApiResponse);
          return;
        }
      }

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Validate project exists and belongs to tenant
        const project = await client.project.findFirst({
          where: {
            id: projectId,
            tenantId: req.tenantId,
          }
        });

        if (!project) {
          throw new ValidationError('Project not found in this tenant');
        }

        // Check if release plan with same version already exists for this project
        const existingReleasePlan = await client.releasePlan.findFirst({
          where: {
            version,
            projectId,
            tenantId: req.tenantId,
          }
        });

        if (existingReleasePlan) {
          throw new ValidationError('Release plan with this version already exists for this project');
        }

        // Create release plan
        const newReleasePlan = await client.releasePlan.create({
          data: {
            tenantId: req.tenantId,
            projectId,
            version,
            description,
            status,
            releaseDate: releaseDate ? new Date(releaseDate) : null,
            createdById: req.user!.id,
          },
          include: {
            project: {
              select: { id: true, name: true, code: true }
            },
            createdBy: {
              select: { id: true, name: true, workEmail: true }
            }
          }
        });

        res.status(201).json({
          success: true,
          data: newReleasePlan,
          message: 'Release plan created successfully'
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error('Create release plan error:', error);
      
      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create release plan'
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
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const updates = req.body;

      // Remove fields that shouldn't be updated directly
      delete updates.tenantId;
      delete updates.createdById;
      delete updates.createdAt;

      // Validate release date if being updated
      if (updates.releaseDate) {
        const releaseDateObj = new Date(updates.releaseDate);
        if (releaseDateObj <= new Date()) {
          res.status(400).json({
            success: false,
            error: 'Release date must be in the future'
          } as ApiResponse);
          return;
        }
      }

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Check if release plan exists and belongs to tenant
        const existingReleasePlan = await client.releasePlan.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          }
        });

        if (!existingReleasePlan) {
          throw new NotFoundError('Release plan not found in this tenant');
        }

        // Check for version conflicts if version is being updated
        if (updates.version && updates.version !== existingReleasePlan.version) {
          const duplicateReleasePlan = await client.releasePlan.findFirst({
            where: {
              version: updates.version,
              projectId: existingReleasePlan.projectId,
              tenantId: req.tenantId,
              id: { not: id }
            }
          });

          if (duplicateReleasePlan) {
            throw new ValidationError('Release plan with this version already exists for this project');
          }
        }

        // Convert date if provided
        if (updates.releaseDate) updates.releaseDate = new Date(updates.releaseDate);

        const updatedReleasePlan = await client.releasePlan.update({
          where: { id },
          data: {
            ...updates,
            updatedAt: new Date()
          },
          include: {
            project: {
              select: { id: true, name: true, code: true }
            },
            createdBy: {
              select: { id: true, name: true, workEmail: true }
            }
          }
        });

        res.status(200).json({
          success: true,
          data: updatedReleasePlan,
          message: 'Release plan updated successfully'
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error('Update release plan error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update release plan'
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
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const existingReleasePlan = await client.releasePlan.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          }
        });

        if (!existingReleasePlan) {
          throw new NotFoundError('Release plan not found in this tenant');
        }

        // Check if any tickets are associated with this release plan
        const ticketsCount = await client.ticket.count({
          where: {
            releasePlanId: id,
            tenantId: req.tenantId,
          }
        });

        if (ticketsCount > 0) {
          // Remove release plan reference from tickets instead of preventing deletion
          await client.ticket.updateMany({
            where: {
              releasePlanId: id,
              tenantId: req.tenantId,
            },
            data: {
              releasePlanId: null,
              updatedAt: new Date()
            }
          });
        }

        await client.releasePlan.delete({
          where: { id }
        });

        res.status(200).json({
          success: true,
          message: 'Release plan deleted successfully'
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error('Delete release plan error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to delete release plan'
      } as ApiResponse);
    }
  }

  /**
   * Get release plans by project (tenant-aware)
   */
  static async getReleasePlansByProject(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { projectId } = req.params;

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Validate project exists and belongs to tenant
        const project = await client.project.findFirst({
          where: {
            id: projectId,
            tenantId: req.tenantId,
          }
        });

        if (!project) {
          throw new NotFoundError('Project not found in this tenant');
        }

        const releasePlans = await client.releasePlan.findMany({
          where: {
            projectId,
            tenantId: req.tenantId,
          },
          include: {
            createdBy: {
              select: { id: true, name: true, workEmail: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        });

        res.status(200).json({
          success: true,
          data: {
            project,
            releasePlans,
            total: releasePlans.length
          }
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error('Get release plans by project error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to fetch release plans by project'
      } as ApiResponse);
    }
  }

  /**
   * Get active release plans (tenant-aware)
   */
  static async getActiveReleasePlans(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const releasePlans = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        return await client.releasePlan.findMany({
          where: {
            tenantId: req.tenantId,
            status: { in: ['planning', 'active'] },
            OR: [
              { releaseDate: null },
              { releaseDate: { gte: new Date() } }
            ]
          },
          include: {
            project: {
              select: { id: true, name: true, code: true }
            },
            createdBy: {
              select: { id: true, name: true, workEmail: true }
            }
          },
          orderBy: [
            { releaseDate: 'asc' },
            { createdAt: 'desc' }
          ]
        });
      });

      res.status(200).json({
        success: true,
        data: releasePlans
      } as ApiResponse);
    } catch (error) {
      console.error('Get active release plans error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch active release plans'
      } as ApiResponse);
    }
  }

  /**
   * Get release plan statistics (tenant-aware)
   */
  static async getReleasePlanStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const stats = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Overall statistics
        const overallStats = await client.releasePlan.groupBy({
          by: ['status'],
          where: { tenantId: req.tenantId },
          _count: true
        });

        // Project-wise statistics - simplified to avoid circular reference
        const projectStats = await client.releasePlan.findMany({
          where: { tenantId: req.tenantId },
          select: {
            projectId: true,
            status: true,
            project: {
              select: { name: true }
            }
          }
        });

        // Format overall stats
        const statusSummary = {
          planning: 0,
          active: 0,
          completed: 0,
          cancelled: 0,
          total: 0
        };

        overallStats.forEach((item: any) => {
          const count = item._count || 0;
          statusSummary.total += count;
          
          switch (item.status) {
            case 'planning':
              statusSummary.planning = count;
              break;
            case 'active':
              statusSummary.active = count;
              break;
            case 'completed':
              statusSummary.completed = count;
              break;
            case 'cancelled':
              statusSummary.cancelled = count;
              break;
          }
        });

        // Get projects with their release plan counts
        const projectsWithCounts = await client.project.findMany({
          where: { tenantId: req.tenantId },
          select: {
            id: true,
            name: true,
            code: true,
            _count: {
              select: {
                releasePlans: true
              }
            }
          },
          orderBy: {
            releasePlans: {
              _count: 'desc'
            }
          }
        });

        return {
          overview: statusSummary,
          projectBreakdown: projectsWithCounts,
          rawProjectStats: projectStats
        };
      });

      res.status(200).json({
        success: true,
        data: stats
      } as ApiResponse);
    } catch (error) {
      console.error('Get release plan stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch release plan statistics'
      } as ApiResponse);
    }
  }

  /**
   * Get tickets by project for release plan assignment (tenant-aware)
   * Simpler version without release plan ID requirement
   */
  static async getProjectTickets(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { projectId } = req.params;
      const { search, limit = 20 } = req.query;

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Validate project exists and belongs to tenant
        const project = await client.project.findFirst({
          where: {
            id: projectId,
            tenantId: req.tenantId,
          }
        });

        if (!project) {
          throw new NotFoundError('Project not found in this tenant');
        }

        // Build filter query
        const where: any = {
          projectId,
          tenantId: req.tenantId,
        };

        // Add search functionality
        if (search) {
          where.OR = [
            { ticketNumber: { contains: search as string, mode: 'insensitive' } },
            { title: { contains: search as string, mode: 'insensitive' } },
            { description: { contains: search as string, mode: 'insensitive' } }
          ];
        }

        const tickets = await client.ticket.findMany({
          where,
          select: {
            id: true,
            ticketNumber: true,
            title: true,
            status: true,
            priority: true,
            releasePlanId: true,
            createdAt: true,
            assignee: {
              select: { id: true, name: true, workEmail: true }
            },
            createdBy: {
              select: { id: true, name: true, workEmail: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: Number(limit)
        });

        res.status(200).json({
          success: true,
          data: tickets
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error('Get project tickets error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to fetch project tickets'
      } as ApiResponse);
    }
  }

  /**
   * Get tickets available for assignment to release plan (tenant-aware)
   */
  static async getAvailableTickets(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { projectId } = req.params;
      const { search, limit = 10, excludeReleasePlan } = req.query;

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Validate project exists and belongs to tenant
        const project = await client.project.findFirst({
          where: {
            id: projectId,
            tenantId: req.tenantId,
          }
        });

        if (!project) {
          throw new NotFoundError('Project not found in this tenant');
        }

        // Build filter query
        const where: any = {
          projectId,
          tenantId: req.tenantId,
        };

        // Exclude tickets already assigned to the current release plan being edited
        if (excludeReleasePlan) {
          where.releasePlanId = { not: excludeReleasePlan };
        }

        // Add search functionality
        if (search) {
          where.OR = [
            { title: { contains: search as string, mode: 'insensitive' } },
            { description: { contains: search as string, mode: 'insensitive' } }
          ];
        }

        const tickets = await client.ticket.findMany({
          where,
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            createdAt: true,
            assignee: {
              select: { id: true, name: true, workEmail: true }
            },
            createdBy: {
              select: { id: true, name: true, workEmail: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: Number(limit)
        });

        res.status(200).json({
          success: true,
          data: tickets
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error('Get available tickets error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to fetch available tickets'
      } as ApiResponse);
    }
  }

  /**
   * Assign tickets to release plan (tenant-aware)
   */
  static async assignTicketsToReleasePlan(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { ticketIds } = req.body;

      if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Ticket IDs are required'
        } as ApiResponse);
        return;
      }

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Validate release plan exists and belongs to tenant
        const releasePlan = await client.releasePlan.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          }
        });

        if (!releasePlan) {
          throw new NotFoundError('Release plan not found in this tenant');
        }

        // Validate all tickets exist and belong to the same project and tenant
        const tickets = await client.ticket.findMany({
          where: {
            id: { in: ticketIds },
            projectId: releasePlan.projectId,
            tenantId: req.tenantId,
          }
        });

        if (tickets.length !== ticketIds.length) {
          throw new ValidationError('Some tickets not found or do not belong to the same project');
        }

        // Assign tickets to release plan
        const result = await client.ticket.updateMany({
          where: {
            id: { in: ticketIds },
            tenantId: req.tenantId,
          },
          data: {
            releasePlanId: id,
            updatedAt: new Date()
          }
        });

        res.status(200).json({
          success: true,
          message: `${result.count} tickets assigned to release plan successfully`,
          data: { assignedCount: result.count }
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error('Assign tickets to release plan error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to assign tickets to release plan'
      } as ApiResponse);
    }
  }

  /**
   * Remove tickets from release plan (tenant-aware)
   */
  static async removeTicketsFromReleasePlan(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { ticketIds } = req.body;

      if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Ticket IDs are required'
        } as ApiResponse);
        return;
      }

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Validate release plan exists and belongs to tenant
        const releasePlan = await client.releasePlan.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          }
        });

        if (!releasePlan) {
          throw new NotFoundError('Release plan not found in this tenant');
        }

        // Remove tickets from release plan
        const result = await client.ticket.updateMany({
          where: {
            id: { in: ticketIds },
            releasePlanId: id,
            tenantId: req.tenantId,
          },
          data: {
            releasePlanId: null,
            updatedAt: new Date()
          }
        });

        res.status(200).json({
          success: true,
          message: `${result.count} tickets removed from release plan successfully`,
          data: { removedCount: result.count }
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error('Remove tickets from release plan error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to remove tickets from release plan'
      } as ApiResponse);
    }
  }
}

export default ReleasePlansController;
