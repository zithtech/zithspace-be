import { Response } from 'express';
import { tenantAwarePrisma } from '@/config/database';
import { 
  AuthRequest, 
  ApiResponse, 
  NotFoundError, 
  ValidationError,
  CreateTicketData,
  UpdateTicketData
} from '@/types';

export class TicketController {
  /**
   * Get dashboard statistics (tenant-aware)
   */
  static async getDashboardStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const currentDate = new Date();
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const stats = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // General statistics
        const generalStats = await client.ticket.groupBy({
          by: ['status'],
          where: {
            tenantId: req.tenantId,
            createdAt: { gte: startOfMonth, lte: endOfMonth }
          },
          _count: true,
        });

        const totalTickets = generalStats.reduce((sum, stat) => sum + stat._count, 0);
        const statusCounts = {
          total: totalTickets,
          in_progress: generalStats.find(s => s.status === 'IN_PROGRESS')?._count || 0,
          not_started: generalStats.find(s => s.status === 'NOT_STARTED')?._count || 0,
          completed: generalStats.find(s => s.status === 'COMPLETED')?._count || 0,
          blocked: generalStats.find(s => s.status === 'BLOCKED')?._count || 0
        };

        return {
          generalStats: statusCounts,
          period: {
            start: startOfMonth,
            end: endOfMonth,
            month: currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })
          }
        };
      });

      res.status(200).json({
        success: true,
        data: stats
      } as ApiResponse);
    } catch (error) {
      console.error('Get dashboard stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch dashboard statistics'
      } as ApiResponse);
    }
  }

  /**
   * Create a new ticket (tenant-aware)
   */
  static async createTicket(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const {
        title,
        description,
        projectId,
        status = 'NOT_STARTED',
        priority = 'MEDIUM',
        type = 'TASK',
        assigneeId,
        dueDate,
        tags = [],
        metadata = {}
      } = req.body as CreateTicketData;

      // Validate required fields
      if (!title || !projectId) {
        res.status(400).json({
          success: false,
          error: 'Title and projectId are required'
        } as ApiResponse);
        return;
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

        // Generate ticket number
        const ticketCount = await client.ticket.count({
          where: { tenantId: req.tenantId }
        });
        const ticketNumber = `${project.code || 'TKT'}-${(ticketCount + 1).toString().padStart(4, '0')}`;

        // Create ticket
        const ticket = await client.ticket.create({
          data: {
            tenantId: req.tenantId,
            title,
            description,
            projectId,
            status,
            priority,
            type,
            assigneeId,
            createdById: req.user!.id,
            dueDate: dueDate ? new Date(dueDate) : null,
            tags,
            metadata,
            ticketNumber,
          },
          include: {
            createdBy: { select: { id: true, name: true, workEmail: true } },
            assignee: { select: { id: true, name: true, workEmail: true } },
            project: { select: { id: true, name: true, code: true } }
          }
        });

        res.status(201).json({
          success: true,
          data: ticket,
          message: 'Ticket created successfully'
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error('Create ticket error:', error);
      
      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create ticket'
      } as ApiResponse);
    }
  }

  /**
   * Get all tickets with filtering, sorting, and pagination (tenant-aware)
   */
  static async getTickets(req: AuthRequest, res: Response): Promise<void> {
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
        status,
        priority,
        projectId,
        assigneeId,
        createdById,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        startDate,
        endDate
      } = req.query;

      // Build filter query
      const where: any = {
        tenantId: req.tenantId
      };

      if (status) where.status = status;
      if (priority) where.priority = priority;
      if (projectId) where.projectId = projectId;
      if (assigneeId) where.assigneeId = assigneeId;
      if (createdById) where.createdById = createdById;

      if (search) {
        where.OR = [
          { title: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } },
          { ticketNumber: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) where.createdAt.lte = new Date(endDate as string);
      }

      // Build sort object
      const orderBy: any = {};
      orderBy[sortBy as string] = sortOrder === 'desc' ? 'desc' : 'asc';

      // Execute query with pagination
      const skip = (Number(page) - 1) * Number(limit);
      
      const [tickets, total] = await Promise.all([
        tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
          return await client.ticket.findMany({
            where,
            include: {
              createdBy: { select: { name: true, workEmail: true } },
              assignee: { select: { name: true, workEmail: true } },
              project: { select: { name: true, code: true, description: true } }
            },
            orderBy,
            skip,
            take: Number(limit),
          });
        }),
        tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
          return await client.ticket.count({ where });
        })
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
          hasPrev: Number(page) > 1
        }
      } as ApiResponse);
    } catch (error) {
      console.error('Get tickets error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch tickets'
      } as ApiResponse);
    }
  }

  /**
   * Get ticket by ID with full details (tenant-aware)
   */
  static async getTicketById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const ticket = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        return await client.ticket.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          },
          include: {
            createdBy: { select: { id: true, name: true, workEmail: true, position: true } },
            assignee: { select: { id: true, name: true, workEmail: true, position: true } },
            project: { 
              select: { 
                id: true, 
                name: true, 
                code: true, 
                description: true,
                projectManager: { select: { name: true, workEmail: true } }
              } 
            }
          }
        });
      });

      if (!ticket) {
        res.status(404).json({
          success: false,
          error: 'Ticket not found'
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: ticket
      } as ApiResponse);
    } catch (error) {
      console.error('Get ticket by ID error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch ticket'
      } as ApiResponse);
    }
  }

  /**
   * Update ticket (tenant-aware)
   */
  static async updateTicket(req: AuthRequest, res: Response): Promise<void> {
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

      const ticket = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const existingTicket = await client.ticket.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          }
        });

        if (!existingTicket) {
          throw new NotFoundError('Ticket not found in this tenant');
        }

        return await client.ticket.update({
          where: { id },
          data: {
            ...updates,
            updatedAt: new Date(),
          },
          include: {
            createdBy: { select: { id: true, name: true, workEmail: true } },
            assignee: { select: { id: true, name: true, workEmail: true } },
            project: { select: { id: true, name: true, code: true } }
          }
        });
      });

      res.status(200).json({
        success: true,
        data: ticket,
        message: 'Ticket updated successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Update ticket error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update ticket'
      } as ApiResponse);
    }
  }

  /**
   * Delete ticket (tenant-aware)
   */
  static async deleteTicket(req: AuthRequest, res: Response): Promise<void> {
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
        const ticket = await client.ticket.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          }
        });

        if (!ticket) {
          throw new NotFoundError('Ticket not found in this tenant');
        }

        await client.ticket.delete({
          where: { id }
        });

        res.status(200).json({
          success: true,
          message: 'Ticket deleted successfully'
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error('Delete ticket error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to delete ticket'
      } as ApiResponse);
    }
  }

  /**
   * Get tickets assigned to current user (tenant-aware)
   */
  static async getMyTickets(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { page = 1, limit = 20, status, priority } = req.query;

      const where: any = { 
        tenantId: req.tenantId,
        assigneeId: req.user.id 
      };
      
      if (status) where.status = status;
      if (priority) where.priority = priority;

      const skip = (Number(page) - 1) * Number(limit);
      
      const [tickets, total] = await Promise.all([
        tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
          return await client.ticket.findMany({
            where,
            include: {
              createdBy: { select: { name: true, workEmail: true } },
              project: { select: { name: true, code: true } }
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: Number(limit),
          });
        }),
        tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
          return await client.ticket.count({ where });
        })
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
          hasPrev: Number(page) > 1
        }
      } as ApiResponse);
    } catch (error) {
      console.error('Get my tickets error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch your tickets'
      } as ApiResponse);
    }
  }

  /**
   * Bulk update ticket status (tenant-aware)
   */
  static async bulkUpdateStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { ticketIds, status } = req.body;

      if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Ticket IDs array is required'
        } as ApiResponse);
        return;
      }

      if (!status) {
        res.status(400).json({
          success: false,
          error: 'Status is required'
        } as ApiResponse);
        return;
      }

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const result = await client.ticket.updateMany({
          where: {
            id: { in: ticketIds },
            tenantId: req.tenantId,
          },
          data: {
            status,
            updatedAt: new Date()
          }
        });

        res.status(200).json({
          success: true,
          data: { updatedCount: result.count },
          message: `${result.count} tickets updated successfully`
        } as ApiResponse);
      });
    } catch (error) {
      console.error('Bulk update status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update tickets'
      } as ApiResponse);
    }
  }

  /**
   * Get ticket statistics by project (tenant-aware)
   */
  static async getTicketStatsByProject(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { projectId } = req.params;

      const stats = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const ticketStats = await client.ticket.groupBy({
          by: ['status'],
          where: {
            projectId,
            tenantId: req.tenantId,
          },
          _count: true,
        });

        const totalTickets = await client.ticket.count({
          where: { projectId, tenantId: req.tenantId }
        });

        return {
          projectId,
          totalTickets,
          stats: ticketStats
        };
      });

      res.status(200).json({
        success: true,
        data: stats
      } as ApiResponse);
    } catch (error) {
      console.error('Get ticket stats by project error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch ticket statistics'
      } as ApiResponse);
    }
  }

  /**
   * Update workflow step (tenant-aware)
   */
  static async updateWorkflowStep(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { stepName, updates } = req.body;

      const ticket = await tenantAwarePrisma.withTenant(req.tenantId!, async (client) => {
        const existingTicket = await client.ticket.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          },
        });

        if (!existingTicket) {
          throw new NotFoundError('Ticket not found');
        }

        return await client.ticket.update({
          where: { id },
          data: {
            ...updates,
            updatedAt: new Date(),
          },
          include: {
            project: { select: { id: true, name: true, code: true } },
            assignee: { select: { id: true, name: true, workEmail: true } },
            createdBy: { select: { id: true, name: true, workEmail: true } },
          },
        });
      });

      res.status(200).json({
        success: true,
        data: ticket,
        message: 'Workflow step updated successfully',
      });
    } catch (error) {
      console.error('Update workflow step error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update workflow step',
      });
    }
  }

  /**
   * Add comment to ticket (tenant-aware)
   */
  static async addComment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { comment, attachments } = req.body;

      const ticket = await tenantAwarePrisma.withTenant(req.tenantId!, async (client) => {
        return await client.ticket.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          },
        });
      });

      if (!ticket) {
        res.status(404).json({
          success: false,
          error: 'Ticket not found',
        });
        return;
      }

      // For now, return success - full comment implementation would need a comments table
      res.status(200).json({
        success: true,
        data: {
          id: `comment_${Date.now()}`,
          comment,
          attachments: attachments || [],
          userId: {
            id: req.user!.id,
            name: req.user?.name,
            email: req.user?.email,
          },
          timestamp: new Date().toISOString(),
        },
        message: 'Comment added successfully',
      });
    } catch (error) {
      console.error('Add comment error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to add comment',
      });
    }
  }

  /**
   * Get related links for ticket (tenant-aware)
   */
  static async getRelatedLinks(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const ticket = await tenantAwarePrisma.withTenant(req.tenantId!, async (client) => {
        return await client.ticket.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          },
        });
      });

      if (!ticket) {
        res.status(404).json({
          success: false,
          error: 'Ticket not found',
        });
        return;
      }

      // For now, return empty array - full implementation would need a related_links table
      res.status(200).json({
        success: true,
        data: [],
      });
    } catch (error) {
      console.error('Get related links error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch related links',
      });
    }
  }

  /**
   * Add related link to ticket (tenant-aware)
   */
  static async addRelatedLink(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { type, description, url } = req.body;

      const ticket = await tenantAwarePrisma.withTenant(req.tenantId!, async (client) => {
        return await client.ticket.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          },
        });
      });

      if (!ticket) {
        res.status(404).json({
          success: false,
          error: 'Ticket not found',
        });
        return;
      }

      // For now, return mock data - full implementation would need a related_links table
      res.status(201).json({
        success: true,
        data: {
          id: `link_${Date.now()}`,
          type,
          description,
          url,
          addedBy: {
            id: req.user!.id,
            name: req.user?.name,
            email: req.user?.email,
          },
          addedAt: new Date().toISOString(),
        },
        message: 'Related link added successfully',
      });
    } catch (error) {
      console.error('Add related link error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to add related link',
      });
    }
  }

  /**
   * Update related link (tenant-aware)
   */
  static async updateRelatedLink(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { ticketId, linkId } = req.params;
      const { description, url } = req.body;

      const ticket = await tenantAwarePrisma.withTenant(req.tenantId!, async (client) => {
        return await client.ticket.findFirst({
          where: {
            id: ticketId,
            tenantId: req.tenantId,
          },
        });
      });

      if (!ticket) {
        res.status(404).json({
          success: false,
          error: 'Ticket not found',
        });
        return;
      }

      // For now, return mock data - full implementation would need a related_links table
      res.status(200).json({
        success: true,
        data: {
          id: linkId,
          description,
          url,
          addedBy: {
            id: req.user!.id,
            name: req.user?.name,
            email: req.user?.email,
          },
          addedAt: new Date().toISOString(),
        },
        message: 'Related link updated successfully',
      });
    } catch (error) {
      console.error('Update related link error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update related link',
      });
    }
  }

  /**
   * Delete related link (tenant-aware)
   */
  static async deleteRelatedLink(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { ticketId, linkId } = req.params;

      const ticket = await tenantAwarePrisma.withTenant(req.tenantId!, async (client) => {
        return await client.ticket.findFirst({
          where: {
            id: ticketId,
            tenantId: req.tenantId,
          },
        });
      });

      if (!ticket) {
        res.status(404).json({
          success: false,
          error: 'Ticket not found',
        });
        return;
      }

      // For now, return success - full implementation would need a related_links table
      res.status(200).json({
        success: true,
        message: 'Related link deleted successfully',
      });
    } catch (error) {
      console.error('Delete related link error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete related link',
      });
    }
  }
}
