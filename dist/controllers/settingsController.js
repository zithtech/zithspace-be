"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
const socketService_1 = require("@/services/socketService");
const transactionHistory_1 = require("@/utils/transactionHistory");
const crypto_1 = require("crypto");
// Simple in-memory cache for ticket configurations
const configCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
class SettingsController {
    /**
     * Get all configuration options for ticket creation (tenant-aware)
     * OPTIMIZED: Uses Promise.all for parallel queries + 5-minute cache
     */
    static async getTicketConfigurations(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            // Check cache first
            const cacheKey = `ticket-config-${req.tenantId}`;
            const cached = configCache.get(cacheKey);
            const now = Date.now();
            if (cached && (now - cached.timestamp) < CACHE_TTL) {
                res.status(200).json({
                    success: true,
                    data: cached.data,
                    cached: true
                });
                return;
            }
            // Fetch parallel data including dynamic dropdown options
            const [users, projects, releasePlans, dropdownOptions] = await Promise.all([
                // Get all users for assignee dropdowns
                database_1.prisma.user.findMany({
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
                }),
                // Get all projects
                database_1.prisma.project.findMany({
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
                }),
                // Get active release plans
                database_1.prisma.releasePlan.findMany({
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
                }),
                // Get all managed dropdown options
                database_1.prisma.dropdownOption.findMany({
                    where: {
                        tenantId: req.tenantId,
                        isActive: true
                    },
                    orderBy: [
                        { category: 'asc' },
                        { order: 'asc' },
                        { label: 'asc' }
                    ]
                })
            ]);
            // Helper to extract options by category
            const getOptions = (category) => dropdownOptions
                .filter(opt => opt.category === category)
                .map((opt) => ({
                value: opt.value,
                label: opt.label,
                color: opt.color || undefined,
                description: opt.description || undefined,
                order: opt.order
            }));
            // Default fallback values if no database options exist
            const configurations = {
                priorities: getOptions('priority').length ? getOptions('priority') : [
                    { value: 'P1', label: 'High (P1)', color: '#ff4d4f', description: 'Critical priority' },
                    { value: 'P2', label: 'Medium (P2)', color: '#fa8c16', description: 'Medium priority' },
                    { value: 'P3', label: 'Lite (P3)', color: '#52c41a', description: 'Low priority' }
                ],
                taskTypes: getOptions('taskType').length ? getOptions('taskType') : [
                    { value: 'Bug', label: 'Bug', color: '#ff4d4f', description: 'Bug fix' },
                    { value: 'Task', label: 'Task', color: '#1890ff', description: 'General task' },
                    { value: 'Feat', label: 'Feature', color: '#52c41a', description: 'New feature' },
                    { value: 'Enhancement', label: 'Enhancement', color: '#722ed1', description: 'Enhancement' }
                ],
                statuses: getOptions('status').length ? getOptions('status') : [
                    { value: 'not_started', label: 'Not Started', color: '#8c8c8c', description: 'Task not started' },
                    { value: 'in_progress', label: 'In Progress', color: '#1677ff', description: 'Task in progress' },
                    { value: 'dev_complete', label: 'Dev Complete', color: '#13c2c2', description: 'Development completed' },
                    { value: 'dev_testing', label: 'Dev Testing', color: '#faad14', description: 'Developer verification phase' },
                    { value: 'in_review', label: 'In Review', color: '#722ed1', description: 'Peer or lead review' },
                    { value: 'live', label: 'Live', color: '#2f54eb', description: 'Deployed to production environment' },
                    { value: 'live_testing', label: 'Live Testing', color: '#1d39c4', description: 'Verification in production' },
                    { value: 'completed', label: 'Completed', color: '#52c41a', description: 'Task officially completed' },
                    { value: 'pause', label: 'Pause', color: '#fa8c16', description: 'Task temporarily paused' },
                ],
                platforms: getOptions('platform').length ? getOptions('platform') : [
                    { value: 'Development', label: 'Development', color: '#1890ff', description: 'Software development tasks' },
                    { value: 'UI/UX', label: 'UI/UX', color: '#722ed1', description: 'User interface and experience design' },
                    { value: 'PM', label: 'PM', color: '#fa8c16', description: 'Project management tasks' },
                    { value: 'Business Team', label: 'Business Team', color: '#52c41a', description: 'Business analysis and requirements' },
                    { value: 'DevOps', label: 'DevOps', color: '#eb2f96', description: 'DevOps and infrastructure' },
                    { value: 'Testing', label: 'Testing', color: '#13c2c2', description: 'Quality assurance and testing' }
                ],
                stacks: getOptions('stack').length ? getOptions('stack') : [
                    { value: 'Front End', label: 'Front End', color: '#1890ff', description: 'Frontend development' },
                    { value: 'Back End', label: 'Back End', color: '#52c41a', description: 'Backend development' },
                    { value: 'Full Stack', label: 'Full Stack', color: '#722ed1', description: 'Full stack development' }
                ],
                taskLevels: getOptions('taskLevel').length ? getOptions('taskLevel') : [
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
                ],
                // Dynamic data from database
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
            // Cache the result
            configCache.set(cacheKey, { data: configurations, timestamp: now });
            res.status(200).json({
                success: true,
                data: configurations
            });
        }
        catch (error) {
            console.error('Get ticket configurations error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch ticket configurations'
            });
        }
    }
    /**
     * Get team members by project or role (tenant-aware)
     */
    static async getTeamMembers(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { projectId, role, position } = req.query;
            const where = {
                tenantId: req.tenantId,
                isActive: true,
            };
            if (role)
                where.role = role;
            if (position)
                where.position = position;
            let users = await database_1.prisma.user.findMany({
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
            const teamMembers = users;
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
            });
        }
        catch (error) {
            console.error('Get team members error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch team members'
            });
        }
    }
    /**
     * Get release plans by project (tenant-aware)
     */
    static async getReleasePlansByProject(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { projectId } = req.params;
            if (!projectId) {
                res.status(400).json({
                    success: false,
                    error: 'Project ID is required'
                });
                return;
            }
            // Validate project exists and belongs to tenant
            const project = await database_1.prisma.project.findFirst({
                where: {
                    id: projectId,
                    tenantId: req.tenantId,
                }
            });
            if (!project) {
                throw new types_1.NotFoundError('Project not found in this tenant');
            }
            const releasePlans = await database_1.prisma.releasePlan.findMany({
                where: {
                    projectId,
                    tenantId: req.tenantId,
                    OR: [
                        { status: 'active' },
                        {
                            status: 'planning',
                            OR: [
                                { releaseDate: null },
                                { releaseDate: { gte: new Date() } }
                            ]
                        }
                    ]
                },
                select: {
                    id: true,
                    version: true,
                    description: true,
                    status: true,
                    releaseDate: true,
                    startDate: true,
                    endDate: true
                },
                orderBy: { releaseDate: 'asc' }
            });
            const formattedPlans = await Promise.all(releasePlans.map(async (plan) => {
                // Count total and completed tickets for this plan/sprint
                const [totalCount, completedCount] = await Promise.all([
                    database_1.prisma.ticket.count({
                        where: {
                            tenantId: req.tenantId,
                            projectId,
                            OR: [
                                { releasePlanId: plan.id },
                                { sprintPlanId: plan.id },
                                { demoPlanId: plan.id }
                            ]
                        }
                    }),
                    database_1.prisma.ticket.count({
                        where: {
                            tenantId: req.tenantId,
                            projectId,
                            OR: [
                                { releasePlanId: plan.id },
                                { sprintPlanId: plan.id },
                                { demoPlanId: plan.id }
                            ],
                            status: { in: ['completed', 'live', 'COMPLETED', 'LIVE'] }
                        }
                    })
                ]);
                return {
                    value: plan.id,
                    label: plan.version,
                    description: plan.description,
                    status: plan.status,
                    releaseDate: plan.releaseDate,
                    startDate: plan.startDate,
                    endDate: plan.endDate,
                    totalTickets: totalCount,
                    completedTickets: completedCount,
                    progress: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
                };
            }));
            res.status(200).json({
                success: true,
                data: formattedPlans
            });
        }
        catch (error) {
            console.error('Get release plans by project error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to fetch release plans'
            });
        }
    }
    /**
     * Get workflow templates by project (tenant-aware)
     */
    static async getWorkflowTemplates(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
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
                const project = await database_1.prisma.project.findFirst({
                    where: {
                        id: projectId,
                        tenantId: req.tenantId,
                    },
                    select: {
                        workflowTemplate: true
                    }
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
            });
        }
        catch (error) {
            console.error('Get workflow templates error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch workflow templates'
            });
        }
    }
    /**
     * Update project workflow template (tenant-aware)
     */
    static async updateWorkflowTemplate(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { projectId } = req.params;
            const { workflowSteps } = req.body;
            if (!projectId) {
                res.status(400).json({
                    success: false,
                    error: 'Project ID is required'
                });
                return;
            }
            if (!workflowSteps || !Array.isArray(workflowSteps) || workflowSteps.length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'Workflow steps are required and must be an array'
                });
                return;
            }
            // Validate project exists and belongs to tenant
            const project = await database_1.prisma.project.findFirst({
                where: {
                    id: projectId,
                    tenantId: req.tenantId,
                }
            });
            if (!project) {
                throw new types_1.NotFoundError('Project not found in this tenant');
            }
            const updatedProject = await database_1.prisma.project.update({
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
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.TICKET_SETTINGS,
                page: transactionHistory_1.Page.WORKFLOW_TEMPLATE,
                action: transactionHistory_1.Action.UPDATE,
                actionLabel: `Workflow template updated (${workflowSteps.length} steps)`,
                entityType: transactionHistory_1.EntityType.WORKFLOW_TEMPLATE,
                entityId: projectId,
                entityLabel: `${updatedProject.code ? `${updatedProject.code} — ` : ""}${updatedProject.name}`,
                parentEntityType: transactionHistory_1.EntityType.PROJECT,
                parentEntityId: projectId,
                beforeData: { stepCount: Array.isArray(project.workflowTemplate) ? project.workflowTemplate.length : 0 },
                afterData: { stepCount: workflowSteps.length, steps: workflowSteps },
                changedFields: ["workflowTemplate"],
                statusCode: 200,
            });
            res.status(200).json({
                success: true,
                data: {
                    project: updatedProject.code,
                    workflowTemplate: updatedProject.workflowTemplate
                },
                message: 'Workflow template updated successfully'
            });
        }
        catch (error) {
            console.error('Update workflow template error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to update workflow template'
            });
        }
    }
    /**
     * Get parent tickets for linking (tenant-aware)
     */
    static async getParentTickets(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { projectId, exclude, search } = req.query;
            const where = {
                tenantId: req.tenantId,
            };
            if (projectId)
                where.projectId = projectId;
            if (exclude)
                where.id = { not: exclude };
            if (search) {
                where.OR = [
                    { title: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } }
                ];
            }
            const tickets = await database_1.prisma.ticket.findMany({
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
            });
        }
        catch (error) {
            console.error('Get parent tickets error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch parent tickets'
            });
        }
    }
    /**
     * Get system statistics for dashboard (tenant-aware)
     */
    static async getSystemStats(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const [userCount, projectCount, ticketCount, releasePlanCount, clientCount] = await Promise.all([
                database_1.prisma.user.count({
                    where: {
                        tenantId: req.tenantId,
                        isActive: true
                    }
                }),
                database_1.prisma.project.count({
                    where: {
                        tenantId: req.tenantId,
                        status: 'active'
                    }
                }),
                database_1.prisma.ticket.count({
                    where: { tenantId: req.tenantId }
                }),
                database_1.prisma.releasePlan.count({
                    where: { tenantId: req.tenantId }
                }),
                database_1.prisma.client.count({
                    where: {
                        tenantId: req.tenantId,
                        isActive: true
                    }
                })
            ]);
            const stats = {
                users: userCount,
                projects: projectCount,
                tickets: ticketCount,
                releasePlans: releasePlanCount,
                clients: clientCount,
                lastUpdated: new Date().toISOString()
            };
            res.status(200).json({
                success: true,
                data: stats
            });
        }
        catch (error) {
            console.error('Get system stats error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch system statistics'
            });
        }
    }
    /**
     * Get tenant settings (tenant-aware)
     */
    static async getTenantSettings(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const tenant = await database_1.prisma.tenant.findFirst({
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
            if (!tenant) {
                res.status(404).json({
                    success: false,
                    error: 'Tenant not found'
                });
                return;
            }
            // Default settings if none exist
            const defaultSettings = {
                allowUserRegistration: false,
                defaultUserRole: 'user',
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
            const settings = tenant.settings ? { ...defaultSettings, ...tenant.settings } : defaultSettings;
            res.status(200).json({
                success: true,
                data: {
                    ...tenant,
                    settings
                }
            });
        }
        catch (error) {
            console.error('Get tenant settings error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch tenant settings'
            });
        }
    }
    /**
     * Update tenant settings (admin only - tenant-aware)
     */
    static async updateTenantSettings(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            // Check if user is admin
            if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
                res.status(403).json({
                    success: false,
                    error: 'Access denied. admin privileges required.'
                });
                return;
            }
            const { settings } = req.body;
            if (!settings || typeof settings !== 'object') {
                res.status(400).json({
                    success: false,
                    error: 'Settings object is required'
                });
                return;
            }
            const updatedTenant = await database_1.prisma.tenant.update({
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
            res.status(200).json({
                success: true,
                data: updatedTenant,
                message: 'Tenant settings updated successfully'
            });
        }
        catch (error) {
            console.error('Update tenant settings error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update tenant settings'
            });
        }
    }
    /**
     * Search across entities (tenant-aware)
     */
    static async globalSearch(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { q, limit = 5 } = req.query;
            if (!q || typeof q !== 'string' || q.trim().length < 2) {
                res.status(400).json({
                    success: false,
                    error: 'Search query must be at least 2 characters long'
                });
                return;
            }
            const searchTerm = q.trim();
            const searchLimit = Math.min(Number(limit), 10); // Cap at 10 results per category
            const [projects, tickets, users, clients, releasePlans] = await Promise.all([
                // Search projects
                database_1.prisma.project.findMany({
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
                database_1.prisma.ticket.findMany({
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
                database_1.prisma.user.findMany({
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
                database_1.prisma.client.findMany({
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
                database_1.prisma.releasePlan.findMany({
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
            const results = {
                projects: projects.map(p => ({ ...p, type: 'project' })),
                tickets: tickets.map(t => ({ ...t, type: 'ticket' })),
                users: users.map(u => ({ ...u, type: 'user' })),
                clients: clients.map(c => ({ ...c, type: 'client' })),
                releasePlans: releasePlans.map(r => ({ ...r, type: 'releasePlan' }))
            };
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
            });
        }
        catch (error) {
            console.error('Global search error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to perform search'
            });
        }
    }
    // ==========================================
    // DROPDOWN OPTIONS MANAGEMENT (CRITICAL)
    // ==========================================
    /**
     * Get all dropdown options grouped by type (tenant-aware)
     */
    static async getDropdownOptions(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { includeInactive } = req.query;
            const activeOnly = includeInactive !== 'true';
            const where = { tenantId: req.tenantId };
            if (activeOnly) {
                where.isActive = true;
            }
            const options = await database_1.prisma.dropdownOption.findMany({
                where,
                orderBy: [
                    { category: 'asc' },
                    { order: 'asc' },
                    { label: 'asc' }
                ]
            });
            // Group by category (map to type for frontend compatibility)
            const grouped = {};
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
            const dropdownOptions = grouped;
            res.status(200).json({
                success: true,
                data: dropdownOptions
            });
        }
        catch (error) {
            console.error('Get dropdown options error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch dropdown options'
            });
        }
    }
    /**
     * Get dropdown options by specific type (tenant-aware)
     */
    static async getDropdownOptionsByType(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
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
                });
                return;
            }
            const activeOnly = includeInactive !== 'true';
            const where = {
                tenantId: req.tenantId,
                category: type
            };
            if (activeOnly) {
                where.isActive = true;
            }
            const options = await database_1.prisma.dropdownOption.findMany({
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
            });
        }
        catch (error) {
            console.error('Get dropdown options by type error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch dropdown options'
            });
        }
    }
    /**
     * Create a new dropdown option (tenant-aware)
     */
    static async createDropdownOption(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { type, value, label, color, description } = req.body;
            if (!type || !value || !label) {
                res.status(400).json({
                    success: false,
                    error: 'Type, value, and label are required'
                });
                return;
            }
            const validTypes = ['platform', 'stack', 'priority', 'taskLevel', 'taskType', 'status'];
            if (!validTypes.includes(type)) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid dropdown type'
                });
                return;
            }
            // Get the next order number for this type
            const lastOption = await database_1.prisma.dropdownOption.findFirst({
                where: { tenantId: req.tenantId, category: type },
                orderBy: { order: 'desc' }
            });
            const order = lastOption ? lastOption.order + 1 : 1;
            const newOption = await database_1.prisma.dropdownOption.create({
                data: {
                    tenantId: req.tenantId,
                    category: type,
                    value,
                    label,
                    order,
                    isActive: true
                }
            });
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.TICKET_SETTINGS,
                page: transactionHistory_1.Page.DROPDOWN_OPTIONS,
                action: transactionHistory_1.Action.CREATE,
                actionLabel: `Dropdown option created (${type})`,
                entityType: transactionHistory_1.EntityType.DROPDOWN_OPTION,
                entityId: newOption.id,
                entityLabel: `${type} — ${newOption.label}`,
                afterData: {
                    type,
                    value: newOption.value,
                    label: newOption.label,
                    order: newOption.order,
                },
                statusCode: 201,
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
            });
            socketService_1.socketService.emitToTenant(req.tenantId, 'settings:updated', { type: 'dropdown', action: 'create', category: type });
        }
        catch (error) {
            console.error('Create dropdown option error:', error);
            if (error.code === 'P2002') {
                res.status(400).json({
                    success: false,
                    error: 'A dropdown option with this value already exists for this type'
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to create dropdown option'
            });
        }
    }
    /**
     * Update an existing dropdown option (tenant-aware)
     * FIXED: Allows order-only updates
     */
    static async updateDropdownOption(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const { value, label, color, description, isActive, order } = req.body;
            console.log('=== UPDATE DROPDOWN OPTION DEBUG ===');
            console.log('Received order value:', order);
            console.log('Received value:', value);
            console.log('Received label:', label);
            console.log('Full body:', req.body);
            // Verify option exists
            const existingOption = await database_1.prisma.dropdownOption.findFirst({
                where: { id, tenantId: req.tenantId }
            });
            if (!existingOption) {
                throw new types_1.NotFoundError('Dropdown option not found');
            }
            // ✅ CRITICAL FIX: Build update data dynamically
            const updateData = {};
            // Only add fields that are provided
            if (value !== undefined)
                updateData.value = value;
            if (label !== undefined)
                updateData.label = label;
            if (color !== undefined)
                updateData.color = color;
            if (description !== undefined)
                updateData.description = description;
            if (isActive !== undefined)
                updateData.isActive = isActive;
            if (order !== undefined)
                updateData.order = order; // ✅ ORDER FIELD ADDED!
            // If no fields to update
            if (Object.keys(updateData).length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'No fields to update'
                });
                return;
            }
            const updatedOption = await database_1.prisma.dropdownOption.update({
                where: { id },
                data: updateData
            });
            {
                const beforeSnap = {};
                const afterSnap = {};
                for (const k of Object.keys(updateData)) {
                    beforeSnap[k] = existingOption[k];
                    afterSnap[k] = updatedOption[k];
                }
                const { changedFields, before, after } = (0, transactionHistory_1.diffShallow)(beforeSnap, afterSnap);
                if (changedFields.length > 0) {
                    (0, transactionHistory_1.recordTransaction)({
                        req,
                        section: transactionHistory_1.Section.WORK,
                        module: transactionHistory_1.Module.TICKET_SETTINGS,
                        page: transactionHistory_1.Page.DROPDOWN_OPTIONS,
                        action: transactionHistory_1.Action.UPDATE,
                        actionLabel: `Dropdown option updated (${changedFields.join(", ")})`,
                        entityType: transactionHistory_1.EntityType.DROPDOWN_OPTION,
                        entityId: id,
                        entityLabel: `${updatedOption.category} — ${updatedOption.label}`,
                        beforeData: before,
                        afterData: after,
                        changedFields,
                        statusCode: 200,
                    });
                }
            }
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
            });
            socketService_1.socketService.emitToTenant(req.tenantId, 'settings:updated', { type: 'dropdown', action: 'update', category: updatedOption.category });
        }
        catch (error) {
            console.error('Update dropdown option error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to update dropdown option'
            });
        }
    }
    /**
     * Delete a dropdown option (tenant-aware)
     */
    static async deleteDropdownOption(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            // Verify option exists and belongs to tenant
            const existingOption = await database_1.prisma.dropdownOption.findFirst({
                where: { id, tenantId: req.tenantId }
            });
            if (!existingOption) {
                throw new types_1.NotFoundError('Dropdown option not found');
            }
            await database_1.prisma.dropdownOption.delete({
                where: { id }
            });
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.TICKET_SETTINGS,
                page: transactionHistory_1.Page.DROPDOWN_OPTIONS,
                action: transactionHistory_1.Action.DELETE,
                actionLabel: `Dropdown option deleted (${existingOption.category})`,
                entityType: transactionHistory_1.EntityType.DROPDOWN_OPTION,
                entityId: id,
                entityLabel: `${existingOption.category} — ${existingOption.label}`,
                beforeData: {
                    type: existingOption.category,
                    value: existingOption.value,
                    label: existingOption.label,
                    order: existingOption.order,
                },
                statusCode: 200,
            });
            res.status(200).json({
                success: true,
                message: 'Dropdown option deleted successfully'
            });
            socketService_1.socketService.emitToTenant(req.tenantId, 'settings:updated', { type: 'dropdown', action: 'delete', category: existingOption.category });
        }
        catch (error) {
            console.error('Delete dropdown option error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to delete dropdown option'
            });
        }
    }
    /**
     * Reorder dropdown options (tenant-aware)
     */
    static async reorderDropdownOptions(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { items } = req.body;
            if (!items || !Array.isArray(items)) {
                res.status(400).json({
                    success: false,
                    error: 'Items array is required'
                });
                return;
            }
            // Update order for each item
            const updatePromises = items.map((item) => database_1.prisma.dropdownOption.updateMany({
                where: {
                    id: item.id,
                    tenantId: req.tenantId
                },
                data: { order: item.order }
            }));
            await Promise.all(updatePromises);
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.TICKET_SETTINGS,
                page: transactionHistory_1.Page.DROPDOWN_OPTIONS,
                action: transactionHistory_1.Action.REORDER,
                actionLabel: `Dropdown options reordered (${items.length})`,
                entityType: transactionHistory_1.EntityType.DROPDOWN_OPTION,
                correlationId: (0, crypto_1.randomUUID)(),
                metadata: { items: items.map((i) => ({ id: i.id, order: i.order })) },
                statusCode: 200,
            });
            res.status(200).json({
                success: true,
                message: 'Dropdown options reordered successfully'
            });
            socketService_1.socketService.emitToTenant(req.tenantId, 'settings:updated', { type: 'dropdown', action: 'reorder' });
        }
        catch (error) {
            console.error('Reorder dropdown options error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to reorder dropdown options'
            });
        }
    }
}
exports.SettingsController = SettingsController;
exports.default = SettingsController;
//# sourceMappingURL=settingsController.js.map