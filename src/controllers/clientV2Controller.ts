import { Response } from 'express';
import { tenantAwarePrisma } from '@/config/database';
import {
    AuthRequest,
    ApiResponse,
    NotFoundError,
    ValidationError,
    CreateClientV2Data,
    UpdateClientV2Data,
    CreateClientContactV2Data,
    UpdateClientContactV2Data,
    CreateEmployeeClientAllocationV2Data,
    UpdateEmployeeClientAllocationV2Data
} from '@/types';
import { uploadClientDocumentToR2, deleteFileFromR2 } from '@/utils/r2Client';

// Utility for auto-generating Client Code
async function generateClientCode(tenantId: string, idPrefix = 'CL-') {
    return await tenantAwarePrisma.withTenant(tenantId, async (client) => {
        const clientsCount = await client.clientV2.count({ where: { tenantId } });
        const paddedNum = (clientsCount + 1).toString().padStart(6, '0');
        return `${idPrefix}${paddedNum}`;
    });
}

/**
 * Utility to map an Employee ID to a User ID for foreign key relations
 * @throws Error 'UserAccountNotFound' if no user is linked to the employee
 */
async function getUserIdFromEmployeeId(prisma: any, employeeId: string, tenantId: string): Promise<string> {
    // 1. Try direct link in User table
    const userByEmployeeId = await prisma.user.findFirst({
        where: { employeeId, tenantId }
    });
    if (userByEmployeeId) return userByEmployeeId.id;

    // 2. Fallback: Lookup employee email and find user by that email
    const employee = await prisma.employee.findUnique({
        where: { id: employeeId }
    });

    if (employee) {
        const userByEmail = await prisma.user.findFirst({
            where: { workEmail: employee.work_email, tenantId }
        });
        if (userByEmail) return userByEmail.id;
    }

    // 3. Last fallback: Check if the ID provided is already a valid User ID
    const isAlreadyUser = await prisma.user.findUnique({
        where: { id: employeeId }
    });
    if (isAlreadyUser) return isAlreadyUser.id;

    throw new Error('UserAccountNotFound');
}

export class ClientV2Controller {
    // ==============================================
    // CLIENT CORE DETAILS
    // ==============================================

    static async getClients(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' } as ApiResponse);
                return;
            }

            const { page = 1, limit = 20, search, status, clientType, riskLevel } = req.query;
            const where: any = { tenantId: req.tenantId, isActive: true };

            if (search) {
                where.OR = [
                    { companyName: { contains: search as string, mode: 'insensitive' } },
                    { clientCode: { contains: search as string, mode: 'insensitive' } },
                ];
            }
            if (status) where.status = status;
            if (clientType) where.clientType = clientType;
            if (riskLevel) where.riskLevel = riskLevel;

            const skip = (Number(page) - 1) * Number(limit);

            const [clients, total] = await Promise.all([
                tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                    return await client.clientV2.findMany({
                        where,
                        include: {
                            accountManager: { select: { id: true, first_name: true, last_name: true } },
                        },
                        orderBy: { createdAt: 'desc' },
                        skip,
                        take: Number(limit),
                    });
                }),
                tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                    return await client.clientV2.count({ where });
                })
            ]);

            res.status(200).json({
                success: true,
                data: clients,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / Number(limit))
                }
            } as ApiResponse);
        } catch (error) {
            console.error('Get ClientV2 error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch clients' } as ApiResponse);
        }
    }

    static async getClientById(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params;
            const client = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.clientV2.findUnique({
                    where: { id },
                    include: {
                        accountManager: { select: { id: true, first_name: true, last_name: true } },
                        salesOwner: { select: { id: true, first_name: true, last_name: true } },
                        deliveryOwner: { select: { id: true, first_name: true, last_name: true } },
                        parentClient: { select: { id: true, companyName: true } },
                        contacts: true,
                        documents: true,
                        allocations: {
                            include: { employee: { select: { id: true, first_name: true, last_name: true } } }
                        }
                    }
                });
            });

            if (!client) {
                res.status(404).json({ success: false, error: 'Client not found' } as ApiResponse);
                return;
            }
            res.status(200).json({ success: true, data: client } as ApiResponse);
        } catch (error) {
            res.status(500).json({ success: false, error: 'Failed to fetch client' } as ApiResponse);
        }
    }

    static async createClient(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' } as ApiResponse);
                return;
            }

            const clientData: CreateClientV2Data = req.body;
            if (!clientData.companyName || !clientData.clientType) {
                res.status(400).json({ success: false, error: 'companyName and clientType are required' } as ApiResponse);
                return;
            }

            const clientCode = await generateClientCode(req.tenantId);

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const newClient = await prisma.clientV2.create({
                    data: {
                        ...clientData,
                        tenantId: req.tenantId!,
                        clientCode,
                        createdById: req.user!.id,
                    }
                });
                res.status(201).json({ success: true, data: newClient, message: 'Client created successfully' } as ApiResponse);
            });
        } catch (error: any) {
            console.error('Create ClientV2 error:', error);
            res.status(500).json({ success: false, error: 'Failed to create client' } as ApiResponse);
        }
    }

    static async updateClient(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) return;
            const { id } = req.params;
            const updates = req.body as UpdateClientV2Data;

            // Sanitize numeric fields to prevent Prisma Decimal parsing errors on strings like "N/A"
            if ('contractValue' in updates) {
                const cv = updates.contractValue as any;
                updates.contractValue = (cv && !isNaN(Number(cv))) ? Number(cv) : null;
            }
            if ('creditLimit' in updates) {
                const cl = updates.creditLimit as any;
                updates.creditLimit = (cl && !isNaN(Number(cl))) ? Number(cl) : null;
            }

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const updatedClient = await prisma.clientV2.update({
                    where: { id },
                    data: updates
                });
                res.status(200).json({ success: true, data: updatedClient, message: 'Client updated successfully' } as ApiResponse);
            });
        } catch (error: any) {
            console.error('Update ClientV2 error:', error);
            res.status(500).json({ success: false, error: 'Failed to update client' } as ApiResponse);
        }
    }


    // ==============================================
    // CONTACTS
    // ==============================================

    static async addContact(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) return;
            const { clientId } = req.params;
            const data: CreateClientContactV2Data = req.body;

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const contact = await prisma.clientContactV2.create({
                    data: {
                        ...data,
                        tenantId: req.tenantId!,
                        clientId,
                    }
                });
                res.status(201).json({ success: true, data: contact } as ApiResponse);
            });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Failed to add contact' } as ApiResponse);
        }
    }

    static async updateContact(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) return;
            const { contactId } = req.params;
            const data: UpdateClientContactV2Data = req.body;

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const contact = await prisma.clientContactV2.update({
                    where: { id: contactId },
                    data
                });
                res.status(200).json({ success: true, data: contact } as ApiResponse);
            });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Failed to update contact' } as ApiResponse);
        }
    }


    // ==============================================
    // DOCUMENTS
    // ==============================================

    static async addDocument(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' } as ApiResponse);
                return;
            }

            const { clientId } = req.params;
            const { base64, fileName, category, documentType } = req.body;

            if (!base64 || !fileName || !category || !documentType) {
                res.status(400).json({ success: false, error: 'Missing required document fields' } as ApiResponse);
                return;
            }

            // Upload to Cloudflare R2
            const fileUrl = await uploadClientDocumentToR2(
                base64,
                fileName,
                req.tenantId,
                clientId,
                category,
                documentType
            );

            // Save record in database
            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const document = await prisma.clientDocumentV2.create({
                    data: {
                        tenantId: req.tenantId!,
                        clientId,
                        category,
                        documentType,
                        fileName,
                        fileUrl,
                        uploadedById: req.user!.id
                    }
                });
                res.status(201).json({ success: true, data: document } as ApiResponse);
            });
        } catch (error: any) {
            console.error('Add document error:', error);
            res.status(500).json({ success: false, error: 'Failed to upload document or save record' } as ApiResponse);
        }
    }

    static async deleteDocument(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { documentId } = req.params;

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const document = await prisma.clientDocumentV2.findUnique({
                    where: { id: documentId }
                });

                if (!document) {
                    res.status(404).json({ success: false, error: 'Document not found' } as ApiResponse);
                    return;
                }

                if (document.fileUrl) {
                    try {
                        await deleteFileFromR2(document.fileUrl, req.tenantId!);
                    } catch (r2Error) {
                        console.error('Failed to delete file from R2, but continuing with DB deletion:', r2Error);
                    }
                }

                await prisma.clientDocumentV2.delete({
                    where: { id: documentId }
                });

                res.status(200).json({ success: true, message: 'Document deleted successfully' } as ApiResponse);
            });
        } catch (error: any) {
            console.error('Delete document error:', error);
            res.status(500).json({ success: false, error: 'Failed to delete document' } as ApiResponse);
        }
    }


    // ==============================================
    // CLIENT PROJECTS
    // ==============================================

    static async getProjects(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { clientId } = req.params;

            const projects = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const clientProjects = await prisma.clientProject.findMany({
                    where: { clientId, tenantId: req.tenantId },
                    include: {
                        project: {
                            include: {
                                projectManager: {
                                    select: { id: true, name: true }
                                }
                            }
                        }
                    },
                    orderBy: { createdAt: 'desc' },
                });

                // Map it to return just the project details with the mapping ID if needed
                return clientProjects.map(cp => ({
                    mappingId: cp.id,
                    billingType: cp.billingType,
                    budget: cp.budget,
                    ...cp.project
                }));
            });

            res.status(200).json({ success: true, data: projects } as ApiResponse);
        } catch (error) {
            console.error('getProjects error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch client projects' } as ApiResponse);
        }
    }

    static async addProject(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { clientId } = req.params;
            const { name, code, budget, billingType, status, projectManagerId, startDate, endDate } = req.body;

            if (!name || !code) {
                res.status(400).json({ success: false, error: 'Project name and code are required' } as ApiResponse);
                return;
            }

            const result = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const actualProjectManagerId = await getUserIdFromEmployeeId(prisma, projectManagerId, req.tenantId!);

                // 1. Create the project in the global projects table
                const project = await prisma.project.create({
                    data: {
                        tenantId: req.tenantId!,
                        name,
                        code,
                        description: `Client project for ${clientId}`,
                        status: status || 'Draft',
                        projectManagerId: actualProjectManagerId,
                        startDate: new Date(startDate),
                        endDate: endDate ? new Date(endDate) : null,
                        createdById: req.user!.id,
                        defaultPriority: 'medium'
                    }
                });

                // 2. Create the mapping in ClientProject
                const mapping = await prisma.clientProject.create({
                    data: {
                        tenantId: req.tenantId!,
                        clientId,
                        projectId: project.id,
                        billingType,
                        budget
                    }
                });

                return { project, mapping };
            });

            res.status(201).json({ success: true, data: result } as ApiResponse);
        } catch (error: any) {
            console.error('addProject error:', error);
            if (error.message === 'UserAccountNotFound') {
                res.status(400).json({ success: false, error: 'The selected employee must have a system user account to be assigned as Project Manager' } as ApiResponse);
                return;
            }
            if (error.code === 'P2002') {
                res.status(400).json({ success: false, error: 'Project code must be unique' } as ApiResponse);
                return;
            }
            res.status(500).json({ success: false, error: 'Failed to create project' } as ApiResponse);
        }
    }

    /**
     * @route   PUT /api/clients-v2/projects/:projectId
     * @desc    Update an existing project and its client mapping
     */
    static async updateProject(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { projectId } = req.params;
            const { name, code, budget, billingType, status, projectManagerId, startDate, endDate } = req.body;

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                let actualProjectManagerId = projectManagerId;
                if (projectManagerId) {
                    actualProjectManagerId = await getUserIdFromEmployeeId(prisma, projectManagerId, req.tenantId!);
                }

                const updateData: any = {};
                if (name) updateData.name = name;
                if (code) updateData.code = code;
                if (status) updateData.status = status;
                if (actualProjectManagerId) updateData.projectManagerId = actualProjectManagerId;
                if (startDate) updateData.startDate = new Date(startDate);
                if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;

                // 1. Update the project in the global projects table
                const project = await prisma.project.update({
                    where: { id: projectId },
                    data: updateData
                });

                // 2. Update the mapping in ClientProject
                const mappingUpdateData: any = {};
                if (billingType) mappingUpdateData.billingType = billingType;
                if (budget !== undefined) mappingUpdateData.budget = budget;

                let mapping = null;
                if (Object.keys(mappingUpdateData).length > 0) {
                    // Find the mapping first because we need the compound unique key or ID
                    const existingMapping = await prisma.clientProject.findFirst({
                        where: { projectId: projectId, tenantId: req.tenantId! }
                    });

                    if (existingMapping) {
                        mapping = await prisma.clientProject.update({
                            where: { id: existingMapping.id },
                            data: mappingUpdateData
                        });
                    }
                }

                res.status(200).json({ success: true, data: { project, mapping }, message: 'Project updated successfully' } as ApiResponse);
            });
        } catch (error: any) {
            console.error('updateProject error:', error);
            if (error.message === 'UserAccountNotFound') {
                res.status(400).json({ success: false, error: 'The selected employee must have a system user account to be assigned as Project Manager' } as ApiResponse);
                return;
            }
            if (error.code === 'P2002') {
                res.status(400).json({ success: false, error: 'Project code must be unique' } as ApiResponse);
                return;
            }
            res.status(500).json({ success: false, error: 'Failed to update project' } as ApiResponse);
        }
    }

    // ==============================================
    // EMPLOYEE ALLOCATIONS
    // ==============================================

    static async addAllocation(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) return;
            const { clientId } = req.params;
            const data: CreateEmployeeClientAllocationV2Data = req.body;

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const allocation = await prisma.employeeClientAllocationV2.create({
                    data: {
                        ...data,
                        tenantId: req.tenantId!,
                        clientId,
                        // Calculate actual bill amount base values on UI or here (we assume passed from FE for now)
                    }
                });
                res.status(201).json({ success: true, data: allocation } as ApiResponse);
            });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Failed to add allocation' } as ApiResponse);
        }
    }

    static async updateAllocation(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) return;
            const { allocationId } = req.params;
            const data: UpdateEmployeeClientAllocationV2Data = req.body;

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const allocation = await prisma.employeeClientAllocationV2.update({
                    where: { id: allocationId },
                    data
                });
                res.status(200).json({ success: true, data: allocation } as ApiResponse);
            });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Failed to update allocation' } as ApiResponse);
        }
    }

    // ==============================================
    // UTILITY: EMPLOYEE DROPDOWN
    // ==============================================

    static async getEmployeesForSelect(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' } as ApiResponse);
                return;
            }

            const employees = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.employee.findMany({
                    where: { tenantId: req.tenantId },
                    select: {
                        id: true,
                        first_name: true,
                        last_name: true,
                        employee_code: true,
                    },
                    orderBy: { first_name: 'asc' }
                });
            });

            res.status(200).json({ success: true, data: employees } as ApiResponse);
        } catch (error) {
            console.error('getEmployeesForSelect error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch employees' } as ApiResponse);
        }
    }
}

export default ClientV2Controller;
