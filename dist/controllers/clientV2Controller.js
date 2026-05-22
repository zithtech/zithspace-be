"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientV2Controller = void 0;
const database_1 = require("@/config/database");
const dbpool_1 = __importDefault(require("@/config/dbpool"));
const r2Client_1 = require("@/utils/r2Client");
// Utility for auto-generating Client Code
async function generateClientCode(tenantId, idPrefix = 'CL-') {
    return await database_1.tenantAwarePrisma.withTenant(tenantId, async (client) => {
        const clientsCount = await client.clientV2.count({ where: { tenantId } });
        const paddedNum = (clientsCount + 1).toString().padStart(6, '0');
        return `${idPrefix}${paddedNum}`;
    });
}
/**
 * Utility to map an Employee ID to a User ID for foreign key relations
 * @throws Error 'UserAccountNotFound' if no user is linked to the employee
 */
async function getUserIdFromEmployeeId(prisma, employeeId, tenantId, fallbackUserId) {
    // 1. Try direct link in User table
    const userByEmployeeId = await prisma.user.findFirst({
        where: { employeeId, tenantId }
    });
    if (userByEmployeeId)
        return userByEmployeeId.id;
    // 2. Fallback: Lookup employee email and find user by that email
    const employee = await prisma.employee.findUnique({
        where: { id: employeeId }
    });
    if (employee) {
        const userByEmail = await prisma.user.findFirst({
            where: {
                OR: [
                    { workEmail: employee.work_email },
                    { personalEmail: employee.personal_email || undefined }
                ],
                tenantId
            }
        });
        if (userByEmail)
            return userByEmail.id;
    }
    // 3. Last fallback: Check if the ID provided is already a valid User ID
    const isAlreadyUser = await prisma.user.findUnique({
        where: { id: employeeId }
    });
    if (isAlreadyUser)
        return isAlreadyUser.id;
    // 4. Final Fallback: Use provided fallback ID or throw if absolutely necessary
    if (fallbackUserId)
        return fallbackUserId;
    throw new Error('UserAccountNotFound');
}
class ClientV2Controller {
    // ==============================================
    // CLIENT CORE DETAILS
    // ==============================================
    static async getClients(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' });
                return;
            }
            const { page = 1, limit = 20, search, status, clientType, riskLevel } = req.query;
            const where = { tenantId: req.tenantId, isActive: true };
            if (search) {
                where.OR = [
                    { companyName: { contains: search, mode: 'insensitive' } },
                    { clientCode: { contains: search, mode: 'insensitive' } },
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
                            accountManager: { select: { id: true, first_name: true, last_name: true } },
                            _count: { select: { ClientProject: true } },
                        },
                        orderBy: { createdAt: 'desc' },
                        skip,
                        take: Number(limit),
                    });
                }),
                database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
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
            });
        }
        catch (error) {
            console.error('Get ClientV2 error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch clients' });
        }
    }
    static async getClientById(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { id } = req.params;
            const client = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.clientV2.findUnique({
                    where: { id },
                    include: {
                        accountManager: { select: { id: true, first_name: true, last_name: true } },
                        salesOwner: { select: { id: true, first_name: true, last_name: true } },
                        deliveryOwner: { select: { id: true, first_name: true, last_name: true } },
                        //parentClient: { select: { id: true, companyName: true } },
                        contacts: true,
                        documents: true,
                        allocations: {
                            include: {
                                employee: { select: { id: true, first_name: true, last_name: true } },
                                project: { select: { id: true } }
                            }
                        }
                    }
                });
            });
            if (!client) {
                res.status(404).json({ success: false, error: 'Client not found' });
                return;
            }
            // Filter out allocations where employee is missing if prisma generate hasn't updated yet
            if (client.allocations) {
                client.allocations = client.allocations.filter((a) => a.employee !== null);
            }
            // Enrich documents with the uploader's name (raw psql, no Prisma relation needed)
            const documents = client.documents;
            if (documents && documents.length > 0) {
                const uploaderIds = Array.from(new Set(documents.map((d) => d.uploadedById).filter((id) => !!id)));
                if (uploaderIds.length > 0) {
                    const placeholders = uploaderIds.map((_, i) => `$${i + 1}`).join(',');
                    const result = await dbpool_1.default.query(`SELECT id, name FROM users WHERE id IN (${placeholders})`, uploaderIds);
                    const idToName = new Map(result.rows.map((r) => [r.id, r.name]));
                    client.documents = documents.map((d) => ({
                        ...d,
                        uploadedByName: idToName.get(d.uploadedById) || null,
                    }));
                }
            }
            res.status(200).json({ success: true, data: client });
        }
        catch (error) {
            console.error('getClientById error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch client' });
        }
    }
    static async createClient(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' });
                return;
            }
            const clientData = req.body;
            if (!clientData.companyName || !clientData.clientType) {
                res.status(400).json({ success: false, error: 'companyName and clientType are required' });
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
                    }
                });
                res.status(201).json({ success: true, data: newClient, message: 'Client created successfully' });
            });
        }
        catch (error) {
            console.error('Create ClientV2 error:', error);
            res.status(500).json({ success: false, error: 'Failed to create client' });
        }
    }
    static async updateClient(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' });
                return;
            }
            const { id } = req.params;
            const body = req.body;
            // Define allowed fields for ClientV2 to sanitize input
            const allowedFields = [
                'companyName', 'clientType', 'legalName', 'parentId', 'companySize', 'industry',
                'contractValue', 'yearOfIncorporation', 'duration', 'gstVatTaxId', 'registrationNumber',
                'country', 'website', 'defaultCurrency', 'billingAddress', 'riskLevel', 'status', 'pan',
                'vatNumber', 'dunsNumber', 'msmeRegistration', 'paymentTerms', 'creditLimit',
                'billingContactEmail', 'accountsPayableName', 'tdsApplicable', 'reverseCharge',
                'accountManagerId', 'salesOwnerId', 'deliveryOwnerId', 'clientSegment',
                'contractStartDate', 'contractEndDate', 'renewalType', 'slaLevel', 'bankName',
                'bankAccountNumber', 'ifscSwift', 'currencyOfPayment', 'preferredPaymentMode', 'isActive'
            ];
            const updates = {};
            for (const key of allowedFields) {
                if (key in body) {
                    let value = body[key];
                    // Sanitize numeric fields
                    if (['contractValue', 'creditLimit'].includes(key)) {
                        value = (value !== null && value !== '' && !isNaN(Number(value))) ? Number(value) : null;
                    }
                    // Sanitize date fields
                    if (['contractStartDate', 'contractEndDate'].includes(key)) {
                        value = (value && value !== '') ? new Date(value) : null;
                    }
                    // Sanitize boolean fields
                    if (['tdsApplicable', 'reverseCharge', 'isActive'].includes(key)) {
                        value = value === true || value === 'true';
                    }
                    updates[key] = value;
                }
            }
            if (Object.keys(updates).length === 0) {
                res.status(400).json({ success: false, error: 'No valid update fields provided' });
                return;
            }
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const updatedClient = await prisma.clientV2.update({
                    where: { id },
                    data: updates
                });
                res.status(200).json({ success: true, data: updatedClient, message: 'Client updated successfully' });
            });
        }
        catch (error) {
            console.error('Update ClientV2 error:', error);
            res.status(500).json({ success: false, error: error.message || 'Failed to update client' });
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
                    }
                });
                res.status(201).json({ success: true, data: contact });
            });
        }
        catch (error) {
            res.status(500).json({ success: false, error: 'Failed to add contact' });
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
                    data
                });
                res.status(200).json({ success: true, data: contact });
            });
        }
        catch (error) {
            res.status(500).json({ success: false, error: 'Failed to update contact' });
        }
    }
    // ==============================================
    // DOCUMENTS
    // ==============================================
    static async addDocument(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' });
                return;
            }
            const { clientId } = req.params;
            const { base64, externalUrl, fileName, category, documentType } = req.body;
            if (!category || !documentType) {
                res.status(400).json({ success: false, error: 'Category and document type are required' });
                return;
            }
            if (!base64 && !externalUrl) {
                res.status(400).json({ success: false, error: 'Either a file upload or an external URL is required' });
                return;
            }
            if (base64 && !fileName) {
                res.status(400).json({ success: false, error: 'fileName is required when uploading a file' });
                return;
            }
            let fileUrl;
            let resolvedFileName;
            if (externalUrl) {
                // External link path — no R2 upload
                try {
                    // Basic URL validation
                    // eslint-disable-next-line no-new
                    new URL(externalUrl);
                }
                catch {
                    res.status(400).json({ success: false, error: 'externalUrl is not a valid URL' });
                    return;
                }
                fileUrl = externalUrl;
                // Prefer caller-supplied display name; else derive from URL path
                if (fileName && fileName.trim().length > 0) {
                    resolvedFileName = fileName.trim();
                }
                else {
                    try {
                        const u = new URL(externalUrl);
                        const last = u.pathname.split('/').filter(Boolean).pop();
                        resolvedFileName = last ? decodeURIComponent(last) : u.hostname;
                    }
                    catch {
                        resolvedFileName = externalUrl;
                    }
                }
            }
            else {
                resolvedFileName = fileName;
                fileUrl = await (0, r2Client_1.uploadClientDocumentToR2)(base64, fileName, req.tenantId, clientId, category, documentType);
            }
            // Save record in database
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const document = await prisma.clientDocumentV2.create({
                    data: {
                        tenantId: req.tenantId,
                        clientId,
                        category,
                        documentType,
                        fileName: resolvedFileName,
                        fileUrl,
                        uploadedById: req.user.id
                    }
                });
                res.status(201).json({ success: true, data: document });
            });
        }
        catch (error) {
            console.error('Add document error:', error);
            res.status(500).json({ success: false, error: 'Failed to upload document or save record' });
        }
    }
    static async deleteDocument(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { documentId } = req.params;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const document = await prisma.clientDocumentV2.findUnique({
                    where: { id: documentId }
                });
                if (!document) {
                    res.status(404).json({ success: false, error: 'Document not found' });
                    return;
                }
                if (document.fileUrl) {
                    try {
                        await (0, r2Client_1.deleteFileFromR2)(document.fileUrl, req.tenantId);
                    }
                    catch (r2Error) {
                        console.error('Failed to delete file from R2, but continuing with DB deletion:', r2Error);
                    }
                }
                await prisma.clientDocumentV2.delete({
                    where: { id: documentId }
                });
                res.status(200).json({ success: true, message: 'Document deleted successfully' });
            });
        }
        catch (error) {
            console.error('Delete document error:', error);
            res.status(500).json({ success: false, error: 'Failed to delete document' });
        }
    }
    static async downloadDocument(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { documentId } = req.params;
            const document = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.clientDocumentV2.findUnique({
                    where: { id: documentId }
                });
            });
            if (!document || document.tenantId !== req.tenantId) {
                res.status(404).json({ success: false, error: 'Document not found' });
                return;
            }
            if (!document.fileUrl) {
                res.status(400).json({ success: false, error: 'Document has no file URL' });
                return;
            }
            const isR2Url = document.fileUrl.includes('r2.cloudflarestorage.com') ||
                document.fileUrl.includes('r2.dev') ||
                (process.env.CF_R2_PUBLIC_URL && document.fileUrl.includes(process.env.CF_R2_PUBLIC_URL));
            if (!isR2Url) {
                res.redirect(document.fileUrl);
                return;
            }
            const axios = require('axios');
            const responseStream = await axios({
                method: 'get',
                url: document.fileUrl,
                responseType: 'stream'
            });
            const fileExtension = document.fileName.split('.').pop()?.toLowerCase();
            let contentType = 'application/octet-stream';
            if (fileExtension === 'pdf')
                contentType = 'application/pdf';
            else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExtension || ''))
                contentType = `image/${fileExtension}`;
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.fileName)}"`);
            responseStream.data.pipe(res);
        }
        catch (error) {
            console.error('Download document error:', error);
            res.status(500).json({ success: false, error: 'Failed to download document' });
        }
    }
    /**
     * Delete a client and all its associated data
     */
    static async deleteClient(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { id } = req.params;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                // 1. Fetch documents to cleanup R2 files
                const documents = await prisma.clientDocumentV2.findMany({
                    where: { clientId: id }
                });
                return await prisma.$transaction(async (tx) => {
                    // 2. Cleanup R2 files
                    for (const doc of documents) {
                        if (doc.fileUrl) {
                            try {
                                await (0, r2Client_1.deleteFileFromR2)(doc.fileUrl, req.tenantId);
                            }
                            catch (err) {
                                console.error(`Failed to delete R2 file for doc ${doc.id}:`, err);
                            }
                        }
                    }
                    // 3. Delete related records
                    await tx.clientContactV2.deleteMany({ where: { clientId: id } });
                    await tx.clientDocumentV2.deleteMany({ where: { clientId: id } });
                    await tx.employeeClientAllocationV2.deleteMany({ where: { clientId: id } });
                    // ClientProject has onDelete: Cascade in schema, but we'll be explicit if needed.
                    // Actually, let's just delete the client and let cascade handle ClientProject
                    // 4. Delete the client itself
                    await tx.clientV2.delete({
                        where: { id }
                    });
                });
            });
            res.status(200).json({ success: true, message: 'Client deleted successfully' });
        }
        catch (error) {
            console.error('Delete client error:', error);
            res.status(500).json({ success: false, error: error.message || 'Failed to delete client' });
        }
    }
    // ==============================================
    // CLIENT PROJECTS
    // ==============================================
    static async getProjects(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
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
            res.status(200).json({ success: true, data: projects });
        }
        catch (error) {
            console.error('getProjects error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch client projects' });
        }
    }
    /**
     * Lightweight project counts for the Client Management dashboard cards.
     * Raw psql — does not touch Prisma.
     * Returns { total, active } scoped to the current tenant.
     */
    static async getProjectStats(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            // Count DISTINCT projects that have at least one client mapping.
            // This matches what the user sees in the Client > Projects tab and
            // ignores orphan project rows (legacy / test data with no client link).
            const totalRes = await dbpool_1.default.query(`SELECT COUNT(DISTINCT cp.project_id)::int AS count
                 FROM client_projects cp
                 INNER JOIN projects p ON p.id = cp.project_id
                 WHERE cp.tenant_id = $1 AND lower(p.status) != 'deleted'`, [req.tenantId]);
            const activeRes = await dbpool_1.default.query(`SELECT COUNT(DISTINCT cp.project_id)::int AS count
                 FROM client_projects cp
                 INNER JOIN projects p ON p.id = cp.project_id
                 WHERE cp.tenant_id = $1 AND lower(p.status) = 'active'`, [req.tenantId]);
            res.status(200).json({
                success: true,
                data: {
                    total: totalRes.rows[0]?.count ?? 0,
                    active: activeRes.rows[0]?.count ?? 0,
                },
            });
        }
        catch (error) {
            console.error('getProjectStats error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch project stats' });
        }
    }
    /**
     * Live duplicate check for project name/code within the current tenant.
     * Either or both query params may be present; only fields ≥ 3 chars are evaluated.
     * Returns { codeExists, nameExists } so the FE can surface inline feedback as the user types.
     * Raw psql — does not touch Prisma.
     */
    static async checkProjectAvailability(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const rawName = typeof req.query.name === 'string' ? req.query.name.trim() : '';
            const rawCode = typeof req.query.code === 'string' ? req.query.code.trim() : '';
            let codeExists = false;
            let nameExists = false;
            if (rawCode.length >= 3) {
                const r = await dbpool_1.default.query('SELECT 1 FROM projects WHERE tenant_id = $1 AND lower(trim(code)) = lower(trim($2)) LIMIT 1', [req.tenantId, rawCode]);
                codeExists = (r.rowCount ?? 0) > 0;
            }
            if (rawName.length >= 3) {
                const r = await dbpool_1.default.query('SELECT 1 FROM projects WHERE tenant_id = $1 AND lower(trim(name)) = lower(trim($2)) LIMIT 1', [req.tenantId, rawName]);
                nameExists = (r.rowCount ?? 0) > 0;
            }
            res.status(200).json({
                success: true,
                data: { codeExists, nameExists },
            });
        }
        catch (error) {
            console.error('checkProjectAvailability error:', error);
            res.status(500).json({ success: false, error: 'Failed to check project availability' });
        }
    }
    /**
     * GET /api/clients-v2/:clientId/projects/importable
     * Lists projects in this tenant that are NOT yet linked to this client,
     * plus a flag indicating how many other clients they're already linked to
     * (so staff can see "this project is shared with 2 other clients" when
     * importing). Excludes soft-deleted projects.
     * Raw psql — does not touch Prisma.
     */
    static async getImportableProjects(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context required',
                });
                return;
            }
            const { clientId } = req.params;
            const search = (req.query.search || '').trim();
            const params = [req.tenantId, clientId];
            let where = `WHERE p.tenant_id = $1
                           AND lower(p.status) <> 'deleted'
                           AND NOT EXISTS (
                             SELECT 1 FROM client_projects cp2
                              WHERE cp2.project_id = p.id
                                AND cp2.tenant_id = $1
                                AND cp2.client_id = $2
                           )`;
            if (search) {
                params.push(`%${search}%`);
                where += ` AND (p.name ILIKE $${params.length}
                             OR p.code ILIKE $${params.length})`;
            }
            const r = await dbpool_1.default.query(`SELECT p.id, p.name, p.code, p.status, p.start_date,
                        p.end_date, p.project_manager_id, p.created_at,
                        u.name AS project_manager_name,
                        (SELECT COUNT(*)::int FROM client_projects cp
                          WHERE cp.project_id = p.id AND cp.tenant_id = $1)
                          AS other_client_count
                   FROM projects p
                   LEFT JOIN users u ON u.id = p.project_manager_id
                   ${where}
                   ORDER BY p.created_at DESC
                   LIMIT 200`, params);
            res.status(200).json({
                success: true,
                data: r.rows.map((row) => ({
                    id: row.id,
                    name: row.name,
                    code: row.code,
                    status: row.status,
                    startDate: row.start_date,
                    endDate: row.end_date,
                    projectManagerId: row.project_manager_id,
                    projectManagerName: row.project_manager_name,
                    createdAt: row.created_at,
                    otherClientCount: row.other_client_count || 0,
                })),
            });
        }
        catch (error) {
            console.error('getImportableProjects error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to load importable projects',
            });
        }
    }
    /**
     * POST /api/clients-v2/:clientId/projects/import
     * body: { projectIds: string[], billingType?, budget? }
     *
     * Bulk-creates `client_projects` rows linking the listed existing
     * projects to this client. Skips projects already linked (idempotent —
     * useful if the picker drifted). Returns the count of new mappings.
     * Raw psql.
     */
    static async importProjects(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context required',
                });
                return;
            }
            const { clientId } = req.params;
            const { projectIds, billingType, budget } = req.body || {};
            if (!Array.isArray(projectIds) || projectIds.length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'projectIds is required',
                });
                return;
            }
            // Verify client belongs to tenant
            const cl = await dbpool_1.default.query(`SELECT 1 FROM clients_v2 WHERE id = $1 AND tenant_id = $2`, [clientId, req.tenantId]);
            if (cl.rowCount === 0) {
                res.status(404).json({
                    success: false,
                    error: 'Client not found',
                });
                return;
            }
            // Filter to projects that exist in this tenant and aren't already
            // linked. Use a single SELECT to avoid N round-trips.
            const valid = await dbpool_1.default.query(`SELECT p.id
                   FROM projects p
                  WHERE p.tenant_id = $1
                    AND p.id = ANY($2::text[])
                    AND lower(p.status) <> 'deleted'
                    AND NOT EXISTS (
                      SELECT 1 FROM client_projects cp
                       WHERE cp.project_id = p.id
                         AND cp.tenant_id = $1
                         AND cp.client_id = $3
                    )`, [req.tenantId, projectIds, clientId]);
            const toLink = valid.rows.map((r) => r.id);
            const skipped = projectIds.length - toLink.length;
            // Insert mappings. `id` and `updated_at` are NOT NULL with no
            // defaults — Prisma normally generates them, so we mirror that
            // here. UNIQUE(client_id, project_id) makes this idempotent.
            for (const pid of toLink) {
                await dbpool_1.default.query(`INSERT INTO client_projects
                       (id, tenant_id, client_id, project_id,
                        billing_type, budget, updated_at)
                     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW())
                     ON CONFLICT DO NOTHING`, [req.tenantId, clientId, pid, billingType || null, budget ?? null]);
            }
            res.status(201).json({
                success: true,
                data: { linked: toLink.length, skipped, projectIds: toLink },
            });
        }
        catch (error) {
            console.error('importProjects error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to import projects',
            });
        }
    }
    static async addProject(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { clientId } = req.params;
            const { name, code, budget, billingType, status, projectManagerId, startDate, endDate } = req.body;
            if (!name || !code) {
                res.status(400).json({ success: false, error: 'Project name and code are required' });
                return;
            }
            const result = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const actualProjectManagerId = await getUserIdFromEmployeeId(prisma, projectManagerId, req.tenantId, req.user.id);
                // 1. Create the project in the global projects table
                const project = await prisma.project.create({
                    data: {
                        tenantId: req.tenantId,
                        name,
                        code,
                        description: `Client project for ${clientId}`,
                        status: status || 'Draft',
                        projectManagerId: actualProjectManagerId,
                        startDate: new Date(startDate),
                        endDate: endDate ? new Date(endDate) : null,
                        createdById: req.user.id,
                        defaultPriority: 'medium'
                    }
                });
                // 2. Create the mapping in ClientProject
                const mapping = await prisma.clientProject.create({
                    data: {
                        tenantId: req.tenantId,
                        clientId,
                        projectId: project.id,
                        billingType,
                        budget
                    }
                });
                return { project, mapping };
            });
            res.status(201).json({ success: true, data: result });
        }
        catch (error) {
            console.error('addProject error:', error);
            if (error.message === 'UserAccountNotFound') {
                res.status(400).json({ success: false, error: 'The selected employee must have a system user account to be assigned as Project Manager' });
                return;
            }
            if (error.code === 'P2002') {
                res.status(400).json({ success: false, error: 'Project code must be unique' });
                return;
            }
            res.status(500).json({ success: false, error: 'Failed to create project' });
        }
    }
    /**
     * @route   PUT /api/clients-v2/projects/:projectId
     * @desc    Update an existing project and its client mapping
     */
    static async updateProject(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { projectId } = req.params;
            const { name, code, budget, billingType, status, projectManagerId, startDate, endDate } = req.body;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                let actualProjectManagerId = projectManagerId;
                if (projectManagerId) {
                    actualProjectManagerId = await getUserIdFromEmployeeId(prisma, projectManagerId, req.tenantId, req.user.id);
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
                    data: updateData
                });
                // 2. Update the mapping in ClientProject
                const mappingUpdateData = {};
                if (billingType)
                    mappingUpdateData.billingType = billingType;
                if (budget !== undefined)
                    mappingUpdateData.budget = budget;
                let mapping = null;
                if (Object.keys(mappingUpdateData).length > 0) {
                    // Find the mapping first because we need the compound unique key or ID
                    const existingMapping = await prisma.clientProject.findFirst({
                        where: { projectId: projectId, tenantId: req.tenantId }
                    });
                    if (existingMapping) {
                        mapping = await prisma.clientProject.update({
                            where: { id: existingMapping.id },
                            data: mappingUpdateData
                        });
                    }
                }
                res.status(200).json({ success: true, data: { project, mapping }, message: 'Project updated successfully' });
            });
        }
        catch (error) {
            console.error('updateProject error:', error);
            if (error.message === 'UserAccountNotFound') {
                res.status(400).json({ success: false, error: 'The selected employee must have a system user account to be assigned as Project Manager' });
                return;
            }
            if (error.code === 'P2002') {
                res.status(400).json({ success: false, error: 'Project code must be unique' });
                return;
            }
            res.status(500).json({ success: false, error: 'Failed to update project' });
        }
    }
    /**
     * @route   DELETE /api/clients-v2/projects/:projectId
     * @desc    Delete a project and its client mapping
     */
    static async deleteProject(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { projectId } = req.params;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                // Delete the mapping first
                await prisma.clientProject.deleteMany({
                    where: { projectId: projectId, tenantId: req.tenantId }
                });
                // Delete the project
                await prisma.project.delete({
                    where: { id: projectId }
                });
            });
            res.status(200).json({ success: true, message: 'Project deleted successfully' });
        }
        catch (error) {
            console.error('deleteProject error:', error);
            res.status(500).json({ success: false, error: 'Failed to delete project' });
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
                    }
                });
                res.status(201).json({ success: true, data: allocation });
            });
        }
        catch (error) {
            res.status(500).json({ success: false, error: 'Failed to add allocation' });
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
                    data
                });
                res.status(200).json({ success: true, data: allocation });
            });
        }
        catch (error) {
            res.status(500).json({ success: false, error: 'Failed to update allocation' });
        }
    }
    // ==============================================
    // UTILITY: EMPLOYEE DROPDOWN
    // ==============================================
    static async getEmployeesForSelect(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' });
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
                    orderBy: { first_name: 'asc' }
                });
            });
            res.status(200).json({ success: true, data: employees });
        }
        catch (error) {
            console.error('getEmployeesForSelect error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch employees' });
        }
    }
}
exports.ClientV2Controller = ClientV2Controller;
exports.default = ClientV2Controller;
//# sourceMappingURL=clientV2Controller.js.map