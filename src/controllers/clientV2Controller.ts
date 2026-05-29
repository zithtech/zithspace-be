import { Response } from 'express';
import { tenantAwarePrisma } from '@/config/database';
import pool from '@/config/dbpool';
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
import { uploadClientDocumentToR2, deleteFileFromR2, generatePresignedUrl, getFileBufferFromR2 } from '@/utils/r2Client';
import { socketService } from '@/services/socketService';

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
async function getUserIdFromEmployeeId(prisma: any, employeeId: string, tenantId: string, fallbackUserId?: string): Promise<string> {
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
            where: {
                OR: [
                    { workEmail: employee.work_email },
                    { personalEmail: employee.personal_email || undefined }
                ],
                tenantId
            }
        });
        if (userByEmail) return userByEmail.id;
    }

    // 3. Last fallback: Check if the ID provided is already a valid User ID
    const isAlreadyUser = await prisma.user.findUnique({
        where: { id: employeeId }
    });
    if (isAlreadyUser) return isAlreadyUser.id;

    // 4. Final Fallback: Use provided fallback ID or throw if absolutely necessary
    if (fallbackUserId) return fallbackUserId;

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
                            _count: { select: { ClientProject: true } },
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
                        //parentClient: { select: { id: true, companyName: true } },
                        contacts: true,
                        documents: true,
                        allocations: {
                            include: {
                                employee: { select: { id: true, first_name: true, last_name: true } },
                                project: { select: { id: true } }
                            }
                        }
                    } as any
                });
            });

            if (!client) {
                res.status(404).json({ success: false, error: 'Client not found' } as ApiResponse);
                return;
            }

            // Filter out allocations where employee is missing if prisma generate hasn't updated yet
            if (client.allocations) {
                (client as any).allocations = (client as any).allocations.filter((a: any) => a.employee !== null);
            }

            // Enrich documents with the uploader's name (raw psql, no Prisma relation needed) and presigned URLs
            let documents = (client as any).documents as any[] | undefined;
            if (documents && documents.length > 0) {
                documents = await Promise.all(
                    documents.map(async (d) => {
                        let signedUrl = d.fileUrl;
                        if (d.fileUrl && (d.fileUrl.includes('r2.cloudflarestorage.com') || d.fileUrl.includes('r2.dev') || (process.env.CF_R2_PUBLIC_URL && d.fileUrl.includes(process.env.CF_R2_PUBLIC_URL)))) {
                            try {
                                signedUrl = await generatePresignedUrl(d.fileUrl, 86400);
                            } catch (err) {
                                console.error(`Failed to generate presigned URL for document ${d.id}:`, err);
                            }
                        }
                        return {
                            ...d,
                            fileUrl: signedUrl
                        };
                    })
                );
                (client as any).documents = documents;

                const uploaderIds = Array.from(
                    new Set(documents.map((d) => d.uploadedById).filter((id): id is string => !!id))
                );
                if (uploaderIds.length > 0) {
                    const placeholders = uploaderIds.map((_, i) => `$${i + 1}`).join(',');
                    const result = await pool.query(
                        `SELECT id, name FROM users WHERE id IN (${placeholders})`,
                        uploaderIds
                    );
                    const idToName = new Map<string, string>(
                        result.rows.map((r: any) => [r.id, r.name])
                    );
                    (client as any).documents = documents.map((d) => ({
                        ...d,
                        uploadedByName: idToName.get(d.uploadedById) || null,
                    }));
                }
            }

            res.status(200).json({ success: true, data: client } as ApiResponse);
        } catch (error) {
            console.error('getClientById error:', error);
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
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' } as ApiResponse);
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

            const updates: any = {};
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
                res.status(400).json({ success: false, error: 'No valid update fields provided' } as ApiResponse);
                return;
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
            res.status(500).json({ success: false, error: error.message || 'Failed to update client' } as ApiResponse);
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
            const { base64, externalUrl, fileName, category, documentType } = req.body;

            if (!category || !documentType) {
                res.status(400).json({ success: false, error: 'Category and document type are required' } as ApiResponse);
                return;
            }
            if (!base64 && !externalUrl) {
                res.status(400).json({ success: false, error: 'Either a file upload or an external URL is required' } as ApiResponse);
                return;
            }
            if (base64 && !fileName) {
                res.status(400).json({ success: false, error: 'fileName is required when uploading a file' } as ApiResponse);
                return;
            }

            let fileUrl: string;
            let resolvedFileName: string;

            if (externalUrl) {
                // External link path — no R2 upload
                try {
                    // Basic URL validation
                    // eslint-disable-next-line no-new
                    new URL(externalUrl);
                } catch {
                    res.status(400).json({ success: false, error: 'externalUrl is not a valid URL' } as ApiResponse);
                    return;
                }
                fileUrl = externalUrl;
                // Prefer caller-supplied display name; else derive from URL path
                if (fileName && fileName.trim().length > 0) {
                    resolvedFileName = fileName.trim();
                } else {
                    try {
                        const u = new URL(externalUrl);
                        const last = u.pathname.split('/').filter(Boolean).pop();
                        resolvedFileName = last ? decodeURIComponent(last) : u.hostname;
                    } catch {
                        resolvedFileName = externalUrl;
                    }
                }
            } else {
                resolvedFileName = fileName;
                fileUrl = await uploadClientDocumentToR2(
                    base64,
                    fileName,
                    req.tenantId,
                    clientId,
                    category,
                    documentType
                );
            }

            // Save record in database
            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const document = await prisma.clientDocumentV2.create({
                    data: {
                        tenantId: req.tenantId!,
                        clientId,
                        category,
                        documentType,
                        fileName: resolvedFileName,
                        fileUrl,
                        uploadedById: req.user!.id
                    }
                });
                socketService.emitToClient(req.tenantId!, clientId, "client_document:created", {
                    clientId,
                    document: { id: document.id },
                });
                
                const responseData = { ...document };
                if (document.fileUrl && (document.fileUrl.includes('r2.cloudflarestorage.com') || document.fileUrl.includes('r2.dev') || (process.env.CF_R2_PUBLIC_URL && document.fileUrl.includes(process.env.CF_R2_PUBLIC_URL)))) {
                    try {
                        responseData.fileUrl = await generatePresignedUrl(document.fileUrl, 86400);
                    } catch (err) {
                        console.error(`Failed to generate presigned URL for document ${document.id}:`, err);
                    }
                }
                res.status(201).json({ success: true, data: responseData } as ApiResponse);
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

                socketService.emitToClient(req.tenantId!, document.clientId, "client_document:deleted", {
                    clientId: document.clientId,
                    id: documentId,
                });

                res.status(200).json({ success: true, message: 'Document deleted successfully' } as ApiResponse);
            });
        } catch (error: any) {
            console.error('Delete document error:', error);
            res.status(500).json({ success: false, error: 'Failed to delete document' } as ApiResponse);
        }
    }

    /**
     * PATCH /api/clients-v2/:clientId/documents/:documentId
     * Updates editable metadata: fileName, category, documentType. The file
     * itself is not replaced — that would be a re-upload.
     */
    static async updateDocument(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { clientId, documentId } = req.params;
            const b = req.body || {};
            const fileName = typeof b.fileName === 'string' ? b.fileName.trim() : undefined;
            const category = typeof b.category === 'string' ? b.category.trim() : undefined;
            const documentType = typeof b.documentType === 'string' ? b.documentType.trim() : undefined;

            if (fileName === undefined && category === undefined && documentType === undefined) {
                res.status(400).json({ success: false, error: 'Nothing to update' } as ApiResponse);
                return;
            }
            if (fileName === '' || category === '' || documentType === '') {
                res.status(400).json({ success: false, error: 'fileName, category and documentType cannot be empty' } as ApiResponse);
                return;
            }

            const sets: string[] = [];
            const params: any[] = [];
            if (fileName !== undefined) {
                params.push(fileName);
                sets.push(`file_name = $${params.length}`);
            }
            if (category !== undefined) {
                params.push(category);
                sets.push(`category = $${params.length}`);
            }
            if (documentType !== undefined) {
                params.push(documentType);
                sets.push(`document_type = $${params.length}`);
            }
            sets.push(`updated_at = NOW()`);

            params.push(documentId);
            params.push(req.tenantId);
            params.push(clientId);

            const r = await pool.query(
                `UPDATE client_documents_v2
                    SET ${sets.join(', ')}
                  WHERE id = $${params.length - 2}
                    AND tenant_id = $${params.length - 1}
                    AND client_id = $${params.length}
                  RETURNING id, category, document_type, file_name, file_url,
                            version, tags, project_id, created_at, updated_at`,
                params,
            );

            if (r.rowCount === 0) {
                res.status(404).json({ success: false, error: 'Document not found' } as ApiResponse);
                return;
            }

            const row = r.rows[0];
            socketService.emitToClient(req.tenantId!, clientId, "client_document:updated", {
                clientId,
                id: row.id,
            });

            let responseFileUrl = row.file_url;
            if (row.file_url && (row.file_url.includes('r2.cloudflarestorage.com') || row.file_url.includes('r2.dev') || (process.env.CF_R2_PUBLIC_URL && row.file_url.includes(process.env.CF_R2_PUBLIC_URL)))) {
                try {
                    responseFileUrl = await generatePresignedUrl(row.file_url, 86400);
                } catch (err) {
                    console.error(`Failed to generate presigned URL for document ${row.id}:`, err);
                }
            }

            res.json({
                success: true,
                data: {
                    id: row.id,
                    category: row.category,
                    documentType: row.document_type,
                    fileName: row.file_name,
                    fileUrl: responseFileUrl,
                    version: row.version,
                    tags: row.tags || [],
                    projectId: row.project_id,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                },
            } as ApiResponse);
        } catch (error: any) {
            console.error('Update document error:', error);
            res.status(500).json({ success: false, error: 'Failed to update document' } as ApiResponse);
        }
    }

    static async downloadDocument(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { documentId } = req.params;

            const document = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.clientDocumentV2.findUnique({
                    where: { id: documentId }
                });
            });

            if (!document || document.tenantId !== req.tenantId) {
                res.status(404).json({ success: false, error: 'Document not found' } as ApiResponse);
                return;
            }

            if (!document.fileUrl) {
                res.status(400).json({ success: false, error: 'Document has no file URL' } as ApiResponse);
                return;
            }

            const isR2Url = document.fileUrl.includes('r2.cloudflarestorage.com') || 
                            document.fileUrl.includes('r2.dev') ||
                            (process.env.CF_R2_PUBLIC_URL && document.fileUrl.includes(process.env.CF_R2_PUBLIC_URL));

            if (!isR2Url) {
                res.redirect(document.fileUrl);
                return;
            }

            const fileBuffer = await getFileBufferFromR2(document.fileUrl);

            const fileExtension = document.fileName.split('.').pop()?.toLowerCase();
            let contentType = 'application/octet-stream';
            if (fileExtension === 'pdf') contentType = 'application/pdf';
            else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExtension || '')) contentType = `image/${fileExtension}`;

            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.fileName)}"`);
            
            res.send(fileBuffer);

        } catch (error: any) {
            console.error('Download document error:', error);
            res.status(500).json({ success: false, error: 'Failed to download document' } as ApiResponse);
        }
    }

    /**
     * Delete a client and all its associated data
     */
    static async deleteClient(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params;

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                // 1. Fetch documents to cleanup R2 files
                const documents = await prisma.clientDocumentV2.findMany({
                    where: { clientId: id }
                });

                return await prisma.$transaction(async (tx) => {
                    // 2. Cleanup R2 files
                    for (const doc of documents) {
                        if (doc.fileUrl) {
                            try {
                                await deleteFileFromR2(doc.fileUrl, req.tenantId!);
                            } catch (err) {
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

            res.status(200).json({ success: true, message: 'Client deleted successfully' } as ApiResponse);
        } catch (error: any) {
            console.error('Delete client error:', error);
            res.status(500).json({ success: false, error: error.message || 'Failed to delete client' } as ApiResponse);
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

    /**
     * Lightweight project counts for the Client Management dashboard cards.
     * Raw psql — does not touch Prisma.
     * Returns { total, active } scoped to the current tenant.
     */
    static async getProjectStats(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            // Count DISTINCT projects that have at least one client mapping.
            // This matches what the user sees in the Client > Projects tab and
            // ignores orphan project rows (legacy / test data with no client link).
            const totalRes = await pool.query(
                `SELECT COUNT(DISTINCT cp.project_id)::int AS count
                 FROM client_projects cp
                 INNER JOIN projects p ON p.id = cp.project_id
                 WHERE cp.tenant_id = $1 AND lower(p.status) != 'deleted'`,
                [req.tenantId]
            );
            const activeRes = await pool.query(
                `SELECT COUNT(DISTINCT cp.project_id)::int AS count
                 FROM client_projects cp
                 INNER JOIN projects p ON p.id = cp.project_id
                 WHERE cp.tenant_id = $1 AND lower(p.status) = 'active'`,
                [req.tenantId]
            );

            res.status(200).json({
                success: true,
                data: {
                    total: totalRes.rows[0]?.count ?? 0,
                    active: activeRes.rows[0]?.count ?? 0,
                },
            } as ApiResponse);
        } catch (error) {
            console.error('getProjectStats error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch project stats' } as ApiResponse);
        }
    }

    /**
     * Live duplicate check for project name/code within the current tenant.
     * Either or both query params may be present; only fields ≥ 3 chars are evaluated.
     * Returns { codeExists, nameExists } so the FE can surface inline feedback as the user types.
     * Raw psql — does not touch Prisma.
     */
    static async checkProjectAvailability(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const rawName = typeof req.query.name === 'string' ? req.query.name.trim() : '';
            const rawCode = typeof req.query.code === 'string' ? req.query.code.trim() : '';

            let codeExists = false;
            let nameExists = false;

            if (rawCode.length >= 3) {
                const r = await pool.query(
                    'SELECT 1 FROM projects WHERE tenant_id = $1 AND lower(trim(code)) = lower(trim($2)) LIMIT 1',
                    [req.tenantId, rawCode]
                );
                codeExists = (r.rowCount ?? 0) > 0;
            }
            if (rawName.length >= 3) {
                const r = await pool.query(
                    'SELECT 1 FROM projects WHERE tenant_id = $1 AND lower(trim(name)) = lower(trim($2)) LIMIT 1',
                    [req.tenantId, rawName]
                );
                nameExists = (r.rowCount ?? 0) > 0;
            }

            res.status(200).json({
                success: true,
                data: { codeExists, nameExists },
            } as ApiResponse);
        } catch (error) {
            console.error('checkProjectAvailability error:', error);
            res.status(500).json({ success: false, error: 'Failed to check project availability' } as ApiResponse);
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
    static async getImportableProjects(
        req: AuthRequest,
        res: Response,
    ): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context required',
                } as ApiResponse);
                return;
            }
            const { clientId } = req.params;
            const search = ((req.query.search as string) || '').trim();

            const params: any[] = [req.tenantId, clientId];
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

            const r = await pool.query(
                `SELECT p.id, p.name, p.code, p.status, p.start_date,
                        p.end_date, p.project_manager_id, p.created_at,
                        u.name AS project_manager_name,
                        (SELECT COUNT(*)::int FROM client_projects cp
                          WHERE cp.project_id = p.id AND cp.tenant_id = $1)
                          AS other_client_count
                   FROM projects p
                   LEFT JOIN users u ON u.id = p.project_manager_id
                   ${where}
                   ORDER BY p.created_at DESC
                   LIMIT 200`,
                params,
            );

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
            } as ApiResponse);
        } catch (error) {
            console.error('getImportableProjects error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to load importable projects',
            } as ApiResponse);
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
    static async importProjects(
        req: AuthRequest,
        res: Response,
    ): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context required',
                } as ApiResponse);
                return;
            }
            const { clientId } = req.params;
            const { projectIds, billingType, budget } = req.body || {};
            if (!Array.isArray(projectIds) || projectIds.length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'projectIds is required',
                } as ApiResponse);
                return;
            }

            // Verify client belongs to tenant
            const cl = await pool.query(
                `SELECT 1 FROM clients_v2 WHERE id = $1 AND tenant_id = $2`,
                [clientId, req.tenantId],
            );
            if (cl.rowCount === 0) {
                res.status(404).json({
                    success: false,
                    error: 'Client not found',
                } as ApiResponse);
                return;
            }

            // Filter to projects that exist in this tenant and aren't already
            // linked. Use a single SELECT to avoid N round-trips.
            const valid = await pool.query(
                `SELECT p.id
                   FROM projects p
                  WHERE p.tenant_id = $1
                    AND p.id = ANY($2::text[])
                    AND lower(p.status) <> 'deleted'
                    AND NOT EXISTS (
                      SELECT 1 FROM client_projects cp
                       WHERE cp.project_id = p.id
                         AND cp.tenant_id = $1
                         AND cp.client_id = $3
                    )`,
                [req.tenantId, projectIds, clientId],
            );
            const toLink = valid.rows.map((r) => r.id as string);
            const skipped = projectIds.length - toLink.length;

            // Insert mappings. `id` and `updated_at` are NOT NULL with no
            // defaults — Prisma normally generates them, so we mirror that
            // here. UNIQUE(client_id, project_id) makes this idempotent.
            for (const pid of toLink) {
                await pool.query(
                    `INSERT INTO client_projects
                       (id, tenant_id, client_id, project_id,
                        billing_type, budget, updated_at)
                     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW())
                     ON CONFLICT DO NOTHING`,
                    [req.tenantId, clientId, pid, billingType || null, budget ?? null],
                );
            }

            res.status(201).json({
                success: true,
                data: { linked: toLink.length, skipped, projectIds: toLink },
            } as ApiResponse);
        } catch (error) {
            console.error('importProjects error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to import projects',
            } as ApiResponse);
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
                const actualProjectManagerId = await getUserIdFromEmployeeId(prisma, projectManagerId, req.tenantId!, req.user!.id);

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
                    actualProjectManagerId = await getUserIdFromEmployeeId(prisma, projectManagerId, req.tenantId!, req.user!.id);
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

    /**
     * @route   DELETE /api/clients-v2/projects/:projectId
     * @desc    Delete a project and its client mapping
     */
    static async deleteProject(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { projectId } = req.params;

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                // Delete the mapping first
                await prisma.clientProject.deleteMany({
                    where: { projectId: projectId, tenantId: req.tenantId! }
                });

                // Delete the project
                await prisma.project.delete({
                    where: { id: projectId }
                });
            });

            res.status(200).json({ success: true, message: 'Project deleted successfully' } as ApiResponse);
        } catch (error: any) {
            console.error('deleteProject error:', error);
            res.status(500).json({ success: false, error: 'Failed to delete project' } as ApiResponse);
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

    // ==============================================
    // CLIENT INVOICES (PORTAL VIEW)
    // ==============================================

    static async getClientInvoices(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { clientId } = req.params;

            // 1. Get all customer IDs linked to this client
            // The relationship is stored as client_id directly on the customers table
            const linkRows = await pool.query(
                `SELECT id as customer_id FROM customers WHERE tenant_id = $1 AND client_id = $2`,
                [req.tenantId, clientId]
            );

            const customerIds = linkRows.rows.map((r: any) => r.customer_id);

            if (customerIds.length === 0) {
                res.status(200).json({ success: true, data: [] } as ApiResponse);
                return;
            }

            // 2. Fetch invoices matching portal visibility statuses
            const validStatuses = ['SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED'];

            const r = await pool.query(
                `SELECT 
                    i.id, 
                    i.invoice_number as "invoiceNumber", 
                    i.invoice_date as "invoiceDate", 
                    i.due_date as "dueDate", 
                    i.currency, 
                    i.subtotal, 
                    i.tax_total as "taxTotal", 
                    i.discount_total as "discountTotal", 
                    i.grand_total as "grandTotal", 
                    i.balance_due as "balanceDue", 
                    i.paid_amount as "paidAmount", 
                    i.status,
                    i.client_status as "clientStatus",
                    c.company_name as "customerName"
                 FROM invoices i
                 LEFT JOIN customers c ON i.customer_id = c.id
                 WHERE i.tenant_id = $1
                   AND i.customer_id = ANY($2::text[])
                   AND i.deleted_at IS NULL
                   AND i.status::text = ANY($3::text[])
                 ORDER BY i.created_at DESC`,
                [req.tenantId, customerIds, validStatuses]
            );

            // Add isOverdue calculation similar to clientPortal
            const data = r.rows.map(row => {
                let isOverdue = false;
                if (
                    ['SENT', 'PARTIALLY_PAID', 'VIEWED'].includes(row.status) &&
                    row.dueDate &&
                    new Date(row.dueDate) < new Date()
                ) {
                    isOverdue = true;
                }
                
                return {
                    ...row,
                    isOverdue
                };
            });

            res.status(200).json({ success: true, data } as ApiResponse);
        } catch (error) {
            console.error('getClientInvoices error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch client invoices' } as ApiResponse);
        }
    }
}

export default ClientV2Controller;
