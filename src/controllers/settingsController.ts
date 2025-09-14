import { Response } from 'express';
import { tenantAwarePrisma } from '@/config/database';
import { 
  AuthRequest, 
  ApiResponse, 
  NotFoundError, 
  ValidationError
} from '@/types';

export class SettingsController {
  /**
   * Get all configuration options for ticket creation (tenant-aware)
   */
  static async getTicketConfigurations(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const configurations = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Get all users for assignee dropdowns
        const users = await client.user.findMany({
          where: {
            tenantId: req.tenantId,
            isActive: true
          },
          select: {
            id: true,
            name: true,
            workEmail: true,
            position: true
          },
          orderBy: { name: 'asc' }
        });

        // Get all projects
        const projects = await client.project.findMany({
          where: {
            tenantId: req.tenantId,
            status: 'active'
          },
          select: {
            id: true,
            name: true,
            code: true,
            description: true
          },
          orderBy: { name: 'asc' }
        });

        // Get active release plans
        const releasePlans = await client.releasePlan.findMany({
          where: {
            tenantId: req.tenantId,
            status: { in: ['planning', 'active'] },
            OR: [
              { releaseDate: null },
              { releaseDate: { gte: new Date() } }
            ]
          },
          select: {
            id: true,
            version: true,
            description: true,
            projectId: true,
            project: {
              select: { name: true }
            }
          },
          orderBy: { version: 'asc' }
        });

        // Default configuration values (can be made tenant-specific in the future)
        const defaultConfigurations = {
          priorities: [
            { value: 'High (P1)', label: 'High (P1)', color: '#ff4d4f', description: 'Critical priority' },
            { value: 'Medium (P2)', label: 'Medium (P2)', color: '#fa8c16', description: 'Medium priority' },
            { value: 'Lite (P3)', label: 'Lite (P3)', color: '#52c41a', description: 'Low priority' }
          ],
          taskTypes: [
            { value: 'Bug', label: 'Bug', color: '#ff4d4f', description: 'Bug fix' },
            { value: 'Task', label: 'Task', color: '#1890ff', description: 'General task' },
            { value: 'Feature', label: 'Feature', color: '#52c41a', description: 'New feature' },
            { value: 'Enhancement', label: 'Enhancement', color: '#722ed1', description: 'Enhancement' }
          ],
          statuses: [
            { value: 'Not Started', label: 'Not Started', color: '#d9d9d9', description: 'Task not started' },
            { value: 'In Progress', label: 'In Progress', color: '#1890ff', description: 'Task in progress' },
            { value: 'In Review', label: 'In Review', color: '#722ed1', description: 'Under review' },
            { value: 'Testing', label: 'Testing', color: '#13c2c2', description: 'In testing phase' },
            { value: 'Completed', label: 'Completed', color: '#52c41a', description: 'Task completed' },
            { value: 'On Hold', label: 'On Hold', color: '#fa8c16', description: 'Task on hold' },
            { value: 'Cancelled', label: 'Cancelled', color: '#8c8c8c', description: 'Task cancelled' }
          ],
          platforms: [
            { value: 'Development', label: 'Development', color: '#1890ff', description: 'Software development tasks' },
            { value: 'UI/UX', label: 'UI/UX', color: '#722ed1', description: 'User interface and experience design' },
            { value: 'PM', label: 'PM', color: '#fa8c16', description: 'Project management tasks' },
            { value: 'Business Team', label: 'Business Team', color: '#52c41a', description: 'Business analysis and requirements' },
            { value: 'DevOps', label: 'DevOps', color: '#eb2f96', description: 'DevOps and infrastructure' },
            { value: 'Testing', label: 'Testing', color: '#13c2c2', description: 'Quality assurance and testing' }
          ],
          stacks: [
            { value: 'Front End', label: 'Front End', color: '#1890ff', description: 'Frontend development' },
            { value: 'Back End', label: 'Back End', color: '#52c41a', description: 'Backend development' },
            { value: 'Full Stack', label: 'Full Stack', color: '#722ed1', description: 'Full stack development' }
          ],
          taskLevels: [
            { value: 'Easy', label: 'Easy', color: '#52c41a', description: 'Simple task' },
            { value: 'Lite', label: 'Lite', color: '#1890ff', description: 'Light complexity' },
            { value: 'Medium', label: 'Medium', color: '#fa8c16', description: 'Medium complexity' },
            { value: 'Hard', label: 'Hard', color: '#ff4d4f', description: 'High complexity' }
          ],
          workflowSteps: [
            'Scope Document',
            'KT (Knowledge Transfer)',
            'Developer Doc',
            'Grooming',
            'Dev Code Work Effort',
            'Designer Approval',
            'Testing',
            'Unit Testing',
            'Code Review',
            'Push to Live',
            'Live Test'
          ]
        };

        return {
          ...defaultConfigurations,
          users: users.map(user => ({
            value: user.id,
            label: user.name,
            email: user.workEmail,
            position: user.position
          })),
          projects: projects.map(project => ({
            value: project.id,
            label: project.name,
            code: project.code,
            description: project.description
          })),
          releasePlans: releasePlans.map(plan => ({
            value: plan.id,
            label: `${plan.version} (${plan.project.name})`,
            description: plan.description,
            projectId: plan.projectId
          }))
        };
      });

      res.status(200).json({
        success: true,
        data: configurations
      } as ApiResponse);
    } catch (error) {
      console.error('Get ticket configurations error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch ticket configurations'
      } as ApiResponse);
    }
  }

  /**
   * Get team members by project or role (tenant-aware)
   */
  static async getTeamMembers(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { projectId, role, position } = req.query;

      const where: any = {
        tenantId: req.tenantId,
        isActive: true,
      };

      if (role) where.role = role;
      if (position) where.position = position;

      const teamMembers = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        let users = await client.user.findMany({
          where,
          select: {
            id: true,
            name: true,
            workEmail: true,
            position: true,
            role: true,
          },
          orderBy: { name: 'asc' }
        });

        // If project is specified, we could filter by project membership in the future
        // For now, return all users that match the criteria
        
        return users;
      });

      const formattedMembers = teamMembers.map(member => ({
        value: member.id,
        label: member.name,
        email: member.workEmail,
        position: member.position,
        role: member.role
      }));

      res.status(200).json({
        success: true,
        data: formattedMembers
      } as ApiResponse);
    } catch (error) {
      console.error('Get team members error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch team members'
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

      if (!projectId) {
        res.status(400).json({
          success: false,
          error: 'Project ID is required'
        } as ApiResponse);
        return;
      }

      const releasePlans = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
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

        return await client.releasePlan.findMany({
          where: {
            projectId,
            tenantId: req.tenantId,
            status: { in: ['planning', 'active'] },
            OR: [
              { releaseDate: null },
              { releaseDate: { gte: new Date() } }
            ]
          },
          select: {
            id: true,
            version: true,
            description: true,
            status: true,
            releaseDate: true
          },
          orderBy: { releaseDate: 'asc' }
        });
      });

      const formattedPlans = releasePlans.map(plan => ({
        value: plan.id,
        label: plan.version,
        description: plan.description,
        status: plan.status,
        releaseDate: plan.releaseDate
      }));

      res.status(200).json({
        success: true,
        data: formattedPlans
      } as ApiResponse);
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
        error: 'Failed to fetch release plans'
      } as ApiResponse);
    }
  }

  /**
   * Get workflow templates by project (tenant-aware)
   */
  static async getWorkflowTemplates(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { projectId } = req.query;

      let workflowSteps = [
        'Scope Document',
        'KT (Knowledge Transfer)',
        'Developer Doc',
        'Grooming',
        'Dev Code Work Effort',
        'Designer Approval',
        'Testing',
        'Unit Testing',
        'Code Review',
        'Push to Live',
        'Live Test'
      ];

      // If project is specified, get project-specific workflow template
      if (projectId) {
        const project = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
          return await client.project.findFirst({
            where: {
              id: projectId as string,
              tenantId: req.tenantId,
            },
            select: {
              workflowTemplate: true
            }
          });
        });

        if (project && project.workflowTemplate && project.workflowTemplate.length > 0) {
          workflowSteps = project.workflowTemplate;
        }
      }

      const templates = {
        default: workflowSteps,
        development: [
          'Scope Document',
          'KT (Knowledge Transfer)',
          'Developer Doc',
          'Grooming',
          'Dev Code Work Effort',
          'Unit Testing',
          'Code Review',
          'Testing',
          'Push to Live',
          'Live Test'
        ],
        uiux: [
          'Scope Document',
          'Designer Doc',
          'Design Review',
          'Prototype',
          'Design Approval',
          'Implementation',
          'Testing',
          'Live Test'
        ],
        testing: [
          'Test Plan',
          'Test Case Creation',
          'Test Execution',
          'Bug Reporting',
          'Regression Testing',
          'Sign Off'
        ]
      };

      res.status(200).json({
        success: true,
        data: {
          selected: workflowSteps,
          templates
        }
      } as ApiResponse);
    } catch (error) {
      console.error('Get workflow templates error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch workflow templates'
      } as ApiResponse);
    }
  }

  /**
   * Update project workflow template (tenant-aware)
   */
  static async updateWorkflowTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { projectId } = req.params;
      const { workflowSteps } = req.body;

      if (!projectId) {
        res.status(400).json({
          success: false,
          error: 'Project ID is required'
        } as ApiResponse);
        return;
      }

      if (!workflowSteps || !Array.isArray(workflowSteps) || workflowSteps.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Workflow steps are required and must be an array'
        } as ApiResponse);
        return;
      }

      const updatedProject = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
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

        return await client.project.update({
          where: { id: projectId },
          data: {
            workflowTemplate: workflowSteps,
            updatedAt: new Date()
          },
          select: {
            id: true,
            name: true,
            code: true,
            workflowTemplate: true,
            updatedAt: true
          }
        });
      });

      res.status(200).json({
        success: true,
        data: {
          project: updatedProject.code,
          workflowTemplate: updatedProject.workflowTemplate
        },
        message: 'Workflow template updated successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Update workflow template error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update workflow template'
      } as ApiResponse);
    }
  }

  /**
   * Get parent tickets for linking (tenant-aware)
   */
  static async getParentTickets(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { projectId, exclude, search } = req.query;

      const where: any = {
        tenantId: req.tenantId,
      };

      if (projectId) where.projectId = projectId;
      if (exclude) where.id = { not: exclude as string };

      if (search) {
        where.OR = [
          { title: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      const tickets = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        return await client.ticket.findMany({
          where,
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            project: {
              select: { name: true, code: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 50
        });
      });

      const parentTickets = tickets.map(ticket => ({
        value: ticket.id,
        label: `${ticket.title}`,
        status: ticket.status,
        priority: ticket.priority,
        project: ticket.project.name
      }));

      res.status(200).json({
        success: true,
        data: parentTickets
      } as ApiResponse);
    } catch (error) {
      console.error('Get parent tickets error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch parent tickets'
      } as ApiResponse);
    }
  }

  /**
   * Get system statistics for dashboard (tenant-aware)
   */
  static async getSystemStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const stats = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const [userCount, projectCount, ticketCount, releasePlanCount, clientCount] = await Promise.all([
          client.user.count({
            where: {
              tenantId: req.tenantId,
              isActive: true
            }
          }),
          client.project.count({
            where: {
              tenantId: req.tenantId,
              status: 'active'
            }
          }),
          client.ticket.count({
            where: { tenantId: req.tenantId }
          }),
          client.releasePlan.count({
            where: { tenantId: req.tenantId }
          }),
          client.client.count({
            where: {
              tenantId: req.tenantId,
              isActive: true
            }
          })
        ]);

        return {
          users: userCount,
          projects: projectCount,
          tickets: ticketCount,
          releasePlans: releasePlanCount,
          clients: clientCount,
          lastUpdated: new Date().toISOString()
        };
      });

      res.status(200).json({
        success: true,
        data: stats
      } as ApiResponse);
    } catch (error) {
      console.error('Get system stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch system statistics'
      } as ApiResponse);
    }
  }

  /**
   * Get tenant settings (tenant-aware)
   */
  static async getTenantSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const tenant = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        return await client.tenant.findFirst({
          where: { id: req.tenantId },
          select: {
            id: true,
            name: true,
            subdomain: true,
            planType: true,
            maxUsers: true,
            isActive: true,
            settings: true,
            createdAt: true,
            updatedAt: true
          }
        });
      });

      if (!tenant) {
        res.status(404).json({
          success: false,
          error: 'Tenant not found'
        } as ApiResponse);
        return;
      }

      // Default settings if none exist
      const defaultSettings = {
        allowUserRegistration: false,
        defaultUserRole: 'USER',
        timezone: 'UTC',
        dateFormat: 'YYYY-MM-DD',
        workingHours: {
          start: '09:00',
          end: '17:00'
        },
        workingDays: [1, 2, 3, 4, 5], // Monday to Friday
        features: {
          attendance: true,
          transactions: true,
          clients: true,
          releasePlanning: true
        }
      };

      const settings = tenant.settings ? { ...defaultSettings, ...(tenant.settings as any) } : defaultSettings;

      res.status(200).json({
        success: true,
        data: {
          ...tenant,
          settings
        }
      } as ApiResponse);
    } catch (error) {
      console.error('Get tenant settings error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch tenant settings'
      } as ApiResponse);
    }
  }

  /**
   * Update tenant settings (admin only - tenant-aware)
   */
  static async updateTenantSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      // Check if user is admin
      if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Access denied. Admin privileges required.'
        } as ApiResponse);
        return;
      }

      const { settings } = req.body;

      if (!settings || typeof settings !== 'object') {
        res.status(400).json({
          success: false,
          error: 'Settings object is required'
        } as ApiResponse);
        return;
      }

      const updatedTenant = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        return await client.tenant.update({
          where: { id: req.tenantId },
          data: {
            settings,
            updatedAt: new Date()
          },
          select: {
            id: true,
            name: true,
            settings: true,
            updatedAt: true
          }
        });
      });

      res.status(200).json({
        success: true,
        data: updatedTenant,
        message: 'Tenant settings updated successfully'
      } as ApiResponse);
    } catch (error) {
      console.error('Update tenant settings error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update tenant settings'
      } as ApiResponse);
    }
  }

  /**
   * Search across entities (tenant-aware)
   */
  static async globalSearch(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { q, limit = 5 } = req.query;

      if (!q || typeof q !== 'string' || q.trim().length < 2) {
        res.status(400).json({
          success: false,
          error: 'Search query must be at least 2 characters long'
        } as ApiResponse);
        return;
      }

      const searchTerm = q.trim();
      const searchLimit = Math.min(Number(limit), 10); // Cap at 10 results per category

      const results = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const [projects, tickets, users, clients, releasePlans] = await Promise.all([
          // Search projects
          client.project.findMany({
            where: {
              tenantId: req.tenantId,
              OR: [
                { name: { contains: searchTerm, mode: 'insensitive' } },
                { code: { contains: searchTerm, mode: 'insensitive' } },
                { description: { contains: searchTerm, mode: 'insensitive' } }
              ]
            },
            select: {
              id: true,
              name: true,
              code: true,
              description: true,
              status: true
            },
            take: searchLimit
          }),
          
          // Search tickets
          client.ticket.findMany({
            where: {
              tenantId: req.tenantId,
              OR: [
                { title: { contains: searchTerm, mode: 'insensitive' } },
                { description: { contains: searchTerm, mode: 'insensitive' } }
              ]
            },
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              project: {
                select: { name: true }
              }
            },
            take: searchLimit
          }),

          // Search users
          client.user.findMany({
            where: {
              tenantId: req.tenantId,
              isActive: true,
              OR: [
                { name: { contains: searchTerm, mode: 'insensitive' } },
                { workEmail: { contains: searchTerm, mode: 'insensitive' } }
              ]
            },
            select: {
              id: true,
              name: true,
              workEmail: true,
              position: true,
              role: true
            },
            take: searchLimit
          }),

          // Search clients
          client.client.findMany({
            where: {
              tenantId: req.tenantId,
              isActive: true,
              OR: [
                { name: { contains: searchTerm, mode: 'insensitive' } },
                { email: { contains: searchTerm, mode: 'insensitive' } },
                { company: { contains: searchTerm, mode: 'insensitive' } }
              ]
            },
            select: {
              id: true,
              name: true,
              email: true,
              company: true,
              contactPerson: true
            },
            take: searchLimit
          }),

          // Search release plans
          client.releasePlan.findMany({
            where: {
              tenantId: req.tenantId,
              OR: [
                { version: { contains: searchTerm, mode: 'insensitive' } },
                { description: { contains: searchTerm, mode: 'insensitive' } }
              ]
            },
            select: {
              id: true,
              version: true,
              description: true,
              status: true,
              project: {
                select: { name: true }
              }
            },
            take: searchLimit
          })
        ]);

        return {
          projects: projects.map(p => ({ ...p, type: 'project' })),
          tickets: tickets.map(t => ({ ...t, type: 'ticket' })),
          users: users.map(u => ({ ...u, type: 'user' })),
          clients: clients.map(c => ({ ...c, type: 'client' })),
          releasePlans: releasePlans.map(r => ({ ...r, type: 'releasePlan' }))
        };
      });

      const totalResults = results.projects.length + results.tickets.length + 
                          results.users.length + results.clients.length + 
                          results.releasePlans.length;

      res.status(200).json({
        success: true,
        data: {
          ...results,
          totalResults,
          searchTerm
        }
      } as ApiResponse);
    } catch (error) {
      console.error('Global search error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to perform search'
      } as ApiResponse);
    }
  }

  // ==========================================
  // DROPDOWN OPTIONS MANAGEMENT (CRITICAL)
  // ==========================================

  /**
   * Get all dropdown options grouped by type (tenant-aware)
   */
  static async getDropdownOptions(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { includeInactive } = req.query;
      const activeOnly = includeInactive !== 'true';

      const dropdownOptions = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const where: any = { tenantId: req.tenantId };
        if (activeOnly) {
          where.isActive = true;
        }

        const options = await client.dropdownOption.findMany({
          where,
          orderBy: [
            { category: 'asc' },
            { order: 'asc' },
            { label: 'asc' }
          ]
        });

        // Group by category (map to type for frontend compatibility)
        const grouped: Record<string, any[]> = {};
        options.forEach(option => {
          // Map PostgreSQL 'category' to MongoDB 'type' for frontend compatibility
          const type = option.category;
          if (!grouped[type]) {
            grouped[type] = [];
          }
          
          grouped[type].push({
            id: option.id,
            type: option.category, // For backward compatibility
            value: option.value,
            label: option.label,
            order: option.order,
            isActive: option.isActive,
            createdAt: option.createdAt,
            updatedAt: option.updatedAt
          });
        });

        return grouped;
      });

      res.status(200).json({
        success: true,
        data: dropdownOptions
      } as ApiResponse);
    } catch (error) {
      console.error('Get dropdown options error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch dropdown options'
      } as ApiResponse);
    }
  }

  /**
   * Get dropdown options by specific type (tenant-aware)
   */
  static async getDropdownOptionsByType(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { type } = req.params;
      const { includeInactive } = req.query;

      // Map frontend type to backend category
      const validTypes = ['platform', 'stack', 'priority', 'taskLevel', 'taskType', 'status'];
      if (!type || !validTypes.includes(type)) {
        res.status(400).json({
          success: false,
          error: 'Invalid dropdown type'
        } as ApiResponse);
        return;
      }

      const activeOnly = includeInactive !== 'true';

      const options = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const where: any = { 
          tenantId: req.tenantId,
          category: type 
        };
        if (activeOnly) {
          where.isActive = true;
        }

        return await client.dropdownOption.findMany({
          where,
          orderBy: [
            { order: 'asc' },
            { label: 'asc' }
          ],
          select: {
            id: true,
            category: true,
            value: true,
            label: true,
            order: true,
            isActive: true,
            createdAt: true,
            updatedAt: true
          }
        });
      });

      // Format for frontend compatibility
      const formattedOptions = options.map(option => ({
        id: option.id,
        type: option.category, // Map category to type
        value: option.value,
        label: option.label,
        order: option.order,
        isActive: option.isActive,
        createdAt: option.createdAt,
        updatedAt: option.updatedAt
      }));

      res.status(200).json({
        success: true,
        data: formattedOptions
      } as ApiResponse);
    } catch (error) {
      console.error('Get dropdown options by type error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch dropdown options'
      } as ApiResponse);
    }
  }

  /**
   * Create a new dropdown option (tenant-aware)
   */
  static async createDropdownOption(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { type, value, label, color, description } = req.body;

      if (!type || !value || !label) {
        res.status(400).json({
          success: false,
          error: 'Type, value, and label are required'
        } as ApiResponse);
        return;
      }

      const validTypes = ['platform', 'stack', 'priority', 'taskLevel', 'taskType', 'status'];
      if (!validTypes.includes(type)) {
        res.status(400).json({
          success: false,
          error: 'Invalid dropdown type'
        } as ApiResponse);
        return;
      }

      const newOption = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Get the next order number for this type
        const lastOption = await client.dropdownOption.findFirst({
          where: { tenantId: req.tenantId, category: type },
          orderBy: { order: 'desc' }
        });
        const order = lastOption ? lastOption.order + 1 : 1;

        return await client.dropdownOption.create({
          data: {
            tenantId: req.tenantId,
            category: type,
            value,
            label,
            order,
            isActive: true
          }
        });
      });

      res.status(201).json({
        success: true,
        data: {
          id: newOption.id,
          type: newOption.category,
          value: newOption.value,
          label: newOption.label,
          order: newOption.order,
          isActive: newOption.isActive,
          createdAt: newOption.createdAt,
          updatedAt: newOption.updatedAt
        },
        message: 'Dropdown option created successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Create dropdown option error:', error);
      
      if (error.code === 'P2002') {
        res.status(400).json({
          success: false,
          error: 'A dropdown option with this value already exists for this type'
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create dropdown option'
      } as ApiResponse);
    }
  }

  /**
   * Update an existing dropdown option (tenant-aware)
   */
  static async updateDropdownOption(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { value, label, color, description, isActive } = req.body;

      if (!value || !label) {
        res.status(400).json({
          success: false,
          error: 'Value and label are required'
        } as ApiResponse);
        return;
      }

      const updatedOption = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Verify option exists and belongs to tenant
        const existingOption = await client.dropdownOption.findFirst({
          where: { id, tenantId: req.tenantId }
        });

        if (!existingOption) {
          throw new NotFoundError('Dropdown option not found');
        }

        const updateData: any = { value, label };
        if (typeof isActive === 'boolean') {
          updateData.isActive = isActive;
        }

        return await client.dropdownOption.update({
          where: { id },
          data: updateData
        });
      });

      res.status(200).json({
        success: true,
        data: {
          id: updatedOption.id,
          type: updatedOption.category,
          value: updatedOption.value,
          label: updatedOption.label,
          order: updatedOption.order,
          isActive: updatedOption.isActive,
          createdAt: updatedOption.createdAt,
          updatedAt: updatedOption.updatedAt
        },
        message: 'Dropdown option updated successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Update dropdown option error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }
      
      if (error.code === 'P2002') {
        res.status(400).json({
          success: false,
          error: 'A dropdown option with this value already exists for this type'
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update dropdown option'
      } as ApiResponse);
    }
  }

  /**
   * Delete a dropdown option (tenant-aware)
   */
  static async deleteDropdownOption(req: AuthRequest, res: Response): Promise<void> {
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
        // Verify option exists and belongs to tenant
        const existingOption = await client.dropdownOption.findFirst({
          where: { id, tenantId: req.tenantId }
        });

        if (!existingOption) {
          throw new NotFoundError('Dropdown option not found');
        }

        await client.dropdownOption.delete({
          where: { id }
        });
      });

      res.status(200).json({
        success: true,
        message: 'Dropdown option deleted successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Delete dropdown option error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to delete dropdown option'
      } as ApiResponse);
    }
  }

  /**
   * Reorder dropdown options (tenant-aware)
   */
  static async reorderDropdownOptions(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { items } = req.body;

      if (!items || !Array.isArray(items)) {
        res.status(400).json({
          success: false,
          error: 'Items array is required'
        } as ApiResponse);
        return;
      }

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Update order for each item
        const updatePromises = items.map((item: { id: string; order: number }) =>
          client.dropdownOption.updateMany({
            where: { 
              id: item.id,
              tenantId: req.tenantId 
            },
            data: { order: item.order }
          })
        );

        await Promise.all(updatePromises);
      });

      res.status(200).json({
        success: true,
        message: 'Dropdown options reordered successfully'
      } as ApiResponse);
    } catch (error) {
      console.error('Reorder dropdown options error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reorder dropdown options'
      } as ApiResponse);
    }
  }
}

export default SettingsController;
