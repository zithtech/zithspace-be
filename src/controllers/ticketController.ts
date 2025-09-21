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
   * Get workflow steps for a ticket (tenant-aware)
   */
  static async getWorkflowSteps(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const workflowSteps = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Verify ticket exists and belongs to tenant
        const ticket = await client.ticket.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          }
        });

        if (!ticket) {
          throw new NotFoundError('Ticket not found');
        }

        return await client.ticketWorkflowStep.findMany({
          where: {
            ticketId: id,
            tenantId: req.tenantId,
          },
          orderBy: { createdAt: 'asc' },
        });
      });

      res.status(200).json({
        success: true,
        data: workflowSteps,
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get workflow steps error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to fetch workflow steps',
      } as ApiResponse);
    }
  }

  /**
   * Update workflow step (tenant-aware)
   */
  static async updateWorkflowStep(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { stepName, updates } = req.body;

      if (!stepName || !updates) {
        res.status(400).json({
          success: false,
          error: 'Step name and updates are required',
        } as ApiResponse);
        return;
      }

      const result = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Verify ticket exists and belongs to tenant
        const ticket = await client.ticket.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          },
        });

        if (!ticket) {
          throw new NotFoundError('Ticket not found');
        }

        // Find or create workflow step
        let workflowStep = await client.ticketWorkflowStep.findFirst({
          where: {
            ticketId: id,
            stepName,
            tenantId: req.tenantId,
          },
        });

        if (!workflowStep) {
          // Create new workflow step
          workflowStep = await client.ticketWorkflowStep.create({
            data: {
              ticketId: id,
              tenantId: req.tenantId,
              stepName,
              status: updates.status || 'not_started',
              assignedTo: updates.assignedTo || [],
              approvers: updates.approvers || [],
              approvalStatus: updates.approvalStatus || [],
              documents: updates.documents || [],
              notes: updates.notes,
              startDate: updates.startDate ? new Date(updates.startDate) : null,
              endDate: updates.endDate ? new Date(updates.endDate) : null,
              completedAt: updates.status === 'completed' ? new Date() : null,
              scheduledMeeting: updates.scheduledMeeting || null,
              branchName: updates.branchName,
              testResults: updates.testResults || [],
            },
          });
        } else {
          // Update existing workflow step
          workflowStep = await client.ticketWorkflowStep.update({
            where: { id: workflowStep.id },
            data: {
              ...updates,
              completedAt: updates.status === 'completed' ? new Date() : workflowStep.completedAt,
              updatedAt: new Date(),
            },
          });
        }

        // Log activity
        await client.ticketActivityLog.create({
          data: {
            ticketId: id,
            tenantId: req.tenantId,
            action: `Workflow Step Updated: ${stepName}`,
            performedById: req.user!.id,
            details: updates,
          },
        });

        // Update ticket's current workflow step if needed
        if (updates.status === 'completed') {
          await client.ticket.update({
            where: { id },
            data: {
              currentWorkflowStep: stepName,
              updatedAt: new Date(),
            },
          });
        }

        return workflowStep;
      });

      res.status(200).json({
        success: true,
        data: result,
        message: 'Workflow step updated successfully',
      } as ApiResponse);
    } catch (error: any) {
      console.error('Update workflow step error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update workflow step',
      } as ApiResponse);
    }
  }

  /**
   * Get comments for a ticket (tenant-aware)
   */
  static async getComments(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const comments = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Verify ticket exists and belongs to tenant
        const ticket = await client.ticket.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          }
        });

        if (!ticket) {
          throw new NotFoundError('Ticket not found');
        }

        return await client.ticketComment.findMany({
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
              }
            }
          },
          orderBy: { timestamp: 'asc' },
        });
      });

      res.status(200).json({
        success: true,
        data: comments,
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get comments error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to fetch comments',
      } as ApiResponse);
    }
  }

  /**
   * Add comment to ticket (tenant-aware)
   */
  static async addComment(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { comment, attachments = [] } = req.body;

      if (!comment || comment.trim() === '') {
        res.status(400).json({
          success: false,
          error: 'Comment text is required',
        } as ApiResponse);
        return;
      }

      const result = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Verify ticket exists and belongs to tenant
        const ticket = await client.ticket.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          }
        });

        if (!ticket) {
          throw new NotFoundError('Ticket not found');
        }

        // Create comment
        const newComment = await client.ticketComment.create({
          data: {
            ticketId: id,
            tenantId: req.tenantId,
            userId: req.user!.id,
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
              }
            }
          },
        });

        // Log activity
        await client.ticketActivityLog.create({
          data: {
            ticketId: id,
            tenantId: req.tenantId,
            action: 'Comment Added',
            performedById: req.user!.id,
            details: { comment },
          },
        });

        return newComment;
      });

      res.status(201).json({
        success: true,
        data: result,
        message: 'Comment added successfully',
      } as ApiResponse);
    } catch (error: any) {
      console.error('Add comment error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to add comment',
      } as ApiResponse);
    }
  }

  /**
   * Get related links for ticket (tenant-aware)
   */
  static async getRelatedLinks(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const relatedLinks = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Verify ticket exists and belongs to tenant
        const ticket = await client.ticket.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          }
        });

        if (!ticket) {
          throw new NotFoundError('Ticket not found');
        }

        return await client.ticketRelatedLink.findMany({
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
              }
            }
          },
          orderBy: { addedAt: 'desc' },
        });
      });

      res.status(200).json({
        success: true,
        data: relatedLinks,
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get related links error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to fetch related links',
      } as ApiResponse);
    }
  }

  /**
   * Add related link to ticket (tenant-aware)
   */
  static async addRelatedLink(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { linkType, title, description, url } = req.body;

      if (!linkType || !title || !description || !url) {
        res.status(400).json({
          success: false,
          error: 'Link type, title, description, and URL are required',
        } as ApiResponse);
        return;
      }

      const result = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Verify ticket exists and belongs to tenant
        const ticket = await client.ticket.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          }
        });

        if (!ticket) {
          throw new NotFoundError('Ticket not found');
        }

        // Create related link
        const newLink = await client.ticketRelatedLink.create({
          data: {
            ticketId: id,
            tenantId: req.tenantId,
            linkType,
            title,
            description,
            url,
            addedById: req.user!.id,
          },
          include: {
            addedBy: {
              select: {
                id: true,
                name: true,
                workEmail: true,
                position: true,
              }
            }
          },
        });

        // Log activity
        await client.ticketActivityLog.create({
          data: {
            ticketId: id,
            tenantId: req.tenantId,
            action: 'Related Link Added',
            performedById: req.user!.id,
            details: { linkType, title, url },
          },
        });

        return newLink;
      });

      res.status(201).json({
        success: true,
        data: result,
        message: 'Related link added successfully',
      } as ApiResponse);
    } catch (error: any) {
      console.error('Add related link error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to add related link',
      } as ApiResponse);
    }
  }

  /**
   * Update related link (tenant-aware)
   */
  static async updateRelatedLink(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { ticketId, linkId } = req.params;
      const { title, description, url } = req.body;

      const result = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Verify ticket exists and belongs to tenant
        const ticket = await client.ticket.findFirst({
          where: {
            id: ticketId,
            tenantId: req.tenantId,
          }
        });

        if (!ticket) {
          throw new NotFoundError('Ticket not found');
        }

        // Verify related link exists and belongs to this ticket and tenant
        const existingLink = await client.ticketRelatedLink.findFirst({
          where: {
            id: linkId,
            ticketId,
            tenantId: req.tenantId,
          }
        });

        if (!existingLink) {
          throw new NotFoundError('Related link not found');
        }

        // Update related link
        const updatedLink = await client.ticketRelatedLink.update({
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
              }
            }
          },
        });

        // Log activity
        await client.ticketActivityLog.create({
          data: {
            ticketId,
            tenantId: req.tenantId,
            action: 'Related Link Updated',
            performedById: req.user!.id,
            details: { linkId, title, description, url },
          },
        });

        return updatedLink;
      });

      res.status(200).json({
        success: true,
        data: result,
        message: 'Related link updated successfully',
      } as ApiResponse);
    } catch (error: any) {
      console.error('Update related link error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update related link',
      } as ApiResponse);
    }
  }

  /**
   * Delete related link (tenant-aware)
   */
  static async deleteRelatedLink(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { ticketId, linkId } = req.params;

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Verify ticket exists and belongs to tenant
        const ticket = await client.ticket.findFirst({
          where: {
            id: ticketId,
            tenantId: req.tenantId,
          }
        });

        if (!ticket) {
          throw new NotFoundError('Ticket not found');
        }

        // Verify related link exists and belongs to this ticket and tenant
        const existingLink = await client.ticketRelatedLink.findFirst({
          where: {
            id: linkId,
            ticketId,
            tenantId: req.tenantId,
          }
        });

        if (!existingLink) {
          throw new NotFoundError('Related link not found');
        }

        // Delete related link
        await client.ticketRelatedLink.delete({
          where: { id: linkId }
        });

        // Log activity
        await client.ticketActivityLog.create({
          data: {
            ticketId,
            tenantId: req.tenantId,
            action: 'Related Link Deleted',
            performedById: req.user!.id,
            details: { linkId, title: existingLink.title },
          },
        });
      });

      res.status(200).json({
        success: true,
        message: 'Related link deleted successfully',
      } as ApiResponse);
    } catch (error: any) {
      console.error('Delete related link error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to delete related link',
      } as ApiResponse);
    }
  }

  /**
   * Get activity log for a ticket (tenant-aware)
   */
  static async getActivityLog(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const activityLog = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Verify ticket exists and belongs to tenant
        const ticket = await client.ticket.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          }
        });

        if (!ticket) {
          throw new NotFoundError('Ticket not found');
        }

        return await client.ticketActivityLog.findMany({
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
              }
            }
          },
          orderBy: { timestamp: 'desc' },
        });
      });

      res.status(200).json({
        success: true,
        data: activityLog,
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get activity log error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to fetch activity log',
      } as ApiResponse);
    }
  }
}
