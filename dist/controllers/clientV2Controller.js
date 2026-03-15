"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientV2Controller = void 0;
const database_1 = require("@/config/database");
const r2Client_1 = require("@/utils/r2Client");
// Utility for auto-generating Client Code
async function generateClientCode(tenantId, idPrefix = "CL-") {
    return await database_1.tenantAwarePrisma.withTenant(tenantId, async (client) => {
        const clientsCount = await client.clientV2.count({ where: { tenantId } });
        const paddedNum = (clientsCount + 1).toString().padStart(6, "0");
        return `${idPrefix}${paddedNum}`;
    });
}
class ClientV2Controller {
    // ==============================================
    // CLIENT CORE DETAILS
    // ==============================================
    static async getClients(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { page = 1, limit = 20, search, status, clientType, riskLevel, } = req.query;
            const where = { tenantId: req.tenantId, isActive: true };
            if (search) {
                where.OR = [
                    { companyName: { contains: search, mode: "insensitive" } },
                    { clientCode: { contains: search, mode: "insensitive" } },
                ];
            }
            if (status)
                where.status = status;
            if (clientType)
                where.clientType = clientType;
            if (riskLevel)
                where.riskLevel = riskLevel;
            const skip = (Number(page) - 1) * Number(limit);
            const [clients, total] = await Promise.all([
                database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                    return await client.clientV2.findMany({
                        where,
                        include: {
                            accountManager: {
                                select: { id: true, first_name: true, last_name: true },
                            },
                        },
                        orderBy: { createdAt: "desc" },
                        skip,
                        take: Number(limit),
                    });
                }),
                database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                    return await client.clientV2.count({ where });
                }),
            ]);
            res.status(200).json({
                success: true,
                data: clients,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / Number(limit)),
                },
            });
        }
        catch (error) {
            console.error("Get ClientV2 error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch clients",
            });
        }
    }
    static async getClientById(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context required",
                });
                return;
            }
            const { id } = req.params;
            const client = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.clientV2.findUnique({
                    where: { id },
                    include: {
                        accountManager: {
                            select: { id: true, first_name: true, last_name: true },
                        },
                        salesOwner: {
                            select: { id: true, first_name: true, last_name: true },
                        },
                        deliveryOwner: {
                            select: { id: true, first_name: true, last_name: true },
                        },
                        parentClient: { select: { id: true, companyName: true } },
                        contacts: true,
                        documents: true,
                        allocations: {
                            include: {
                                employee: {
                                    select: { id: true, first_name: true, last_name: true },
                                },
                            },
                        },
                    },
                });
            });
            if (!client) {
                res
                    .status(404)
                    .json({ success: false, error: "Client not found" });
                return;
            }
            res.status(200).json({ success: true, data: client });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: "Failed to fetch client",
            });
        }
    }
    static async createClient(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const clientData = req.body;
            if (!clientData.companyName || !clientData.clientType) {
                res.status(400).json({
                    success: false,
                    error: "companyName and clientType are required",
                });
                return;
            }
            const clientCode = await generateClientCode(req.tenantId);
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const newClient = await prisma.clientV2.create({
                    data: {
                        ...clientData,
                        tenantId: req.tenantId,
                        clientCode,
                        createdById: req.user.id,
                    },
                });
                res.status(201).json({
                    success: true,
                    data: newClient,
                    message: "Client created successfully",
                });
            });
        }
        catch (error) {
            console.error("Create ClientV2 error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to create client",
            });
        }
    }
    static async updateClient(req, res) {
        try {
            if (!req.tenantId || !req.user)
                return;
            const { id } = req.params;
            const updates = req.body;
            // Sanitize numeric fields to prevent Prisma Decimal parsing errors on strings like "N/A"
            if ("contractValue" in updates) {
                const cv = updates.contractValue;
                updates.contractValue = cv && !isNaN(Number(cv)) ? Number(cv) : null;
            }
            if ("creditLimit" in updates) {
                const cl = updates.creditLimit;
                updates.creditLimit = cl && !isNaN(Number(cl)) ? Number(cl) : null;
            }
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const updatedClient = await prisma.clientV2.update({
                    where: { id },
                    data: updates,
                });
                res.status(200).json({
                    success: true,
                    data: updatedClient,
                    message: "Client updated successfully",
                });
            });
        }
        catch (error) {
            console.error("Update ClientV2 error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to update client",
            });
        }
    }
    // ==============================================
    // CONTACTS
    // ==============================================
    static async addContact(req, res) {
        try {
            if (!req.tenantId)
                return;
            const { clientId } = req.params;
            const data = req.body;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const contact = await prisma.clientContactV2.create({
                    data: {
                        ...data,
                        tenantId: req.tenantId,
                        clientId,
                    },
                });
                res.status(201).json({ success: true, data: contact });
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: "Failed to add contact",
            });
        }
    }
    static async updateContact(req, res) {
        try {
            if (!req.tenantId)
                return;
            const { contactId } = req.params;
            const data = req.body;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const contact = await prisma.clientContactV2.update({
                    where: { id: contactId },
                    data,
                });
                res.status(200).json({ success: true, data: contact });
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: "Failed to update contact",
            });
        }
    }
    // ==============================================
    // DOCUMENTS
    // ==============================================
    static async addDocument(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { clientId } = req.params;
            const { base64, fileName, category, documentType } = req.body;
            if (!base64 || !fileName || !category || !documentType) {
                res.status(400).json({
                    success: false,
                    error: "Missing required document fields",
                });
                return;
            }
            // Upload to Cloudflare R2
            const fileUrl = await (0, r2Client_1.uploadClientDocumentToR2)(base64, fileName, req.tenantId, clientId, category, documentType);
            // Save record in database
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const document = await prisma.clientDocumentV2.create({
                    data: {
                        tenantId: req.tenantId,
                        clientId,
                        category,
                        documentType,
                        fileName,
                        fileUrl,
                        uploadedById: req.user.id,
                    },
                });
                res.status(201).json({ success: true, data: document });
            });
        }
        catch (error) {
            console.error("Add document error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to upload document or save record",
            });
        }
    }
    static async deleteDocument(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context required",
                });
                return;
            }
            const { documentId } = req.params;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const document = await prisma.clientDocumentV2.findUnique({
                    where: { id: documentId },
                });
                if (!document) {
                    res.status(404).json({
                        success: false,
                        error: "Document not found",
                    });
                    return;
                }
                if (document.fileUrl) {
                    try {
                        await (0, r2Client_1.deleteFileFromR2)(document.fileUrl, req.tenantId);
                    }
                    catch (r2Error) {
                        console.error("Failed to delete file from R2, but continuing with DB deletion:", r2Error);
                    }
                }
                await prisma.clientDocumentV2.delete({
                    where: { id: documentId },
                });
                res.status(200).json({
                    success: true,
                    message: "Document deleted successfully",
                });
            });
        }
        catch (error) {
            console.error("Delete document error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to delete document",
            });
        }
    }
    // ==============================================
    // CLIENT PROJECTS
    // ==============================================
    static async getProjects(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context required",
                });
                return;
            }
            const { clientId } = req.params;
            const projects = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const clientProjects = await prisma.clientProject.findMany({
                    where: { clientId, tenantId: req.tenantId },
                    include: {
                        project: {
                            include: {
                                projectManager: {
                                    select: { id: true, name: true },
                                },
                            },
                        },
                    },
                    orderBy: { createdAt: "desc" },
                });
                // Map it to return just the project details with the mapping ID if needed
                return clientProjects.map((cp) => ({
                    mappingId: cp.id,
                    billingType: cp.billingType,
                    budget: cp.budget,
                    currency: cp.budgetType,
                    ...cp.project,
                }));
            });
            res.status(200).json({ success: true, data: projects });
        }
        catch (error) {
            console.error("getProjects error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch client projects",
            });
        }
    }
    static async addProject(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context required",
                });
                return;
            }
            const { clientId } = req.params;
            const { name, code, budget, currency, billingType, status, projectManagerId, startDate, endDate, } = req.body;
            console.log("req.body:", req.body);
            if (!name || !code) {
                res.status(400).json({
                    success: false,
                    error: "Project name and code are required",
                });
                return;
            }
            const result = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                // Since we're picking from Employees in UI, but Project expects a User ID:
                let actualProjectManagerId = projectManagerId;
                const employee = await prisma.employee.findUnique({
                    where: { id: projectManagerId },
                });
                if (employee) {
                    const user = await prisma.user.findFirst({
                        where: { workEmail: employee.work_email, tenantId: req.tenantId },
                    });
                    if (user) {
                        actualProjectManagerId = user.id;
                    }
                }
                // 1. Create the project in the global projects table
                const project = await prisma.project.create({
                    data: {
                        tenantId: req.tenantId,
                        name,
                        code,
                        description: `Client project for ${clientId}`, // Default description
                        status: status || "Draft",
                        projectManagerId: actualProjectManagerId,
                        startDate: new Date(startDate),
                        endDate: endDate ? new Date(endDate) : null,
                        createdById: req.user.id,
                        defaultPriority: "medium",
                    },
                });
                // 2. Create the mapping in ClientProject
                const mapping = await prisma.clientProject.create({
                    data: {
                        tenantId: req.tenantId,
                        clientId,
                        projectId: project.id,
                        billingType,
                        budget,
                        budgetType: currency,
                    },
                });
                return { project, mapping };
            });
            res.status(201).json({ success: true, data: result });
        }
        catch (error) {
            console.error("addProject error:", error);
            if (error.code === "P2002") {
                res.status(400).json({
                    success: false,
                    error: "Project code must be unique",
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to create and map project",
            });
        }
    }
    /**
     * @route   PUT /api/clients-v2/projects/:projectId
     * @desc    Update an existing project and its client mapping
     */
    static async updateProject(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context required",
                });
                return;
            }
            const { projectId } = req.params;
            const { name, code, budget, currency, billingType, status, projectManagerId, startDate, endDate, } = req.body;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                let actualProjectManagerId = projectManagerId;
                if (projectManagerId) {
                    const employee = await prisma.employee.findUnique({
                        where: { id: projectManagerId },
                    });
                    if (employee) {
                        const user = await prisma.user.findFirst({
                            where: { workEmail: employee.work_email, tenantId: req.tenantId },
                        });
                        if (user) {
                            actualProjectManagerId = user.id;
                        }
                    }
                }
                const updateData = {};
                if (name)
                    updateData.name = name;
                if (code)
                    updateData.code = code;
                if (status)
                    updateData.status = status;
                if (actualProjectManagerId)
                    updateData.projectManagerId = actualProjectManagerId;
                if (startDate)
                    updateData.startDate = new Date(startDate);
                if (endDate !== undefined)
                    updateData.endDate = endDate ? new Date(endDate) : null;
                // 1. Update the project in the global projects table
                const project = await prisma.project.update({
                    where: { id: projectId },
                    data: updateData,
                });
                // 2. Update the mapping in ClientProject
                const mappingUpdateData = {};
                if (billingType !== undefined)
                    mappingUpdateData.billingType = billingType;
                if (budget !== undefined)
                    mappingUpdateData.budget = budget;
                if (currency !== undefined)
                    mappingUpdateData.budgetType = currency;
                let mapping = null;
                if (Object.keys(mappingUpdateData).length > 0) {
                    // Find the mapping first because we need the compound unique key or ID
                    const existingMapping = await prisma.clientProject.findFirst({
                        where: { projectId: projectId, tenantId: req.tenantId },
                    });
                    if (existingMapping) {
                        mapping = await prisma.clientProject.update({
                            where: { id: existingMapping.id },
                            data: mappingUpdateData,
                        });
                    }
                }
                res.status(200).json({
                    success: true,
                    data: { project, mapping },
                    message: "Project updated successfully",
                });
            });
        }
        catch (error) {
            console.error("updateProject error:", error);
            if (error.code === "P2002") {
                res.status(400).json({
                    success: false,
                    error: "Project code must be unique",
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to update project",
            });
        }
    }
    // ==============================================
    // EMPLOYEE ALLOCATIONS
    // ==============================================
    static async addAllocation(req, res) {
        try {
            if (!req.tenantId)
                return;
            const { clientId } = req.params;
            const data = req.body;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const allocation = await prisma.employeeClientAllocationV2.create({
                    data: {
                        ...data,
                        tenantId: req.tenantId,
                        clientId,
                        // Calculate actual bill amount base values on UI or here (we assume passed from FE for now)
                    },
                });
                res
                    .status(201)
                    .json({ success: true, data: allocation });
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: "Failed to add allocation",
            });
        }
    }
    static async updateAllocation(req, res) {
        try {
            if (!req.tenantId)
                return;
            const { allocationId } = req.params;
            const data = req.body;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const allocation = await prisma.employeeClientAllocationV2.update({
                    where: { id: allocationId },
                    data,
                });
                res
                    .status(200)
                    .json({ success: true, data: allocation });
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: "Failed to update allocation",
            });
        }
    }
    // ==============================================
    // UTILITY: EMPLOYEE DROPDOWN
    // ==============================================
    static async getEmployeesForSelect(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const employees = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.employee.findMany({
                    where: { tenantId: req.tenantId },
                    select: {
                        id: true,
                        first_name: true,
                        last_name: true,
                        employee_code: true,
                    },
                    orderBy: { first_name: "asc" },
                });
            });
            res.status(200).json({ success: true, data: employees });
        }
        catch (error) {
            console.error("getEmployeesForSelect error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch employees",
            });
        }
    }
}
exports.ClientV2Controller = ClientV2Controller;
exports.default = ClientV2Controller;
//# sourceMappingURL=clientV2Controller.js.map