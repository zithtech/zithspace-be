import { Response } from 'express';
import { tenantAwarePrisma } from '@/config/database';
import {
    AuthRequest,
    ApiResponse,
    CreateImplementationPartnerData,
    UpdateImplementationPartnerData
} from '@/types';
import { uploadFileToR2, deleteFileFromR2 } from '@/utils/r2Client';

export class ImplementationPartnerController {
    /**
     * Get all implementation partners with pagination and filters
     */
    static async getPartners(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { page = 1, limit = 20, search, industry, status } = req.query;
            const where: any = { tenantId: req.tenantId };

            if (search) {
                where.companyName = { contains: search as string, mode: 'insensitive' };
            }
            if (industry) {
                where.industry = industry as string;
            }
            if (status !== undefined) {
                where.status = status === 'true';
            }

            const skip = (Number(page) - 1) * Number(limit);

            const [partners, total] = await Promise.all([
                tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                    return await (prisma.implementationBasicInformation.findMany as any)({
                        where,
                        include: {
                            contactPersons: true,
                            businessDetails: true,
                            relations: true,
                            documents: true,
                        },
                        orderBy: { createdAt: 'desc' },
                        skip,
                        take: Number(limit),
                    });
                }),
                tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                    return await prisma.implementationBasicInformation.count({ where });
                })
            ]);

            res.status(200).json({
                success: true,
                data: partners,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / Number(limit))
                }
            } as ApiResponse);
        } catch (error) {
            console.error('Get Implementation Partners error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch implementation partners' } as ApiResponse);
        }
    }

    /**
     * Get a single implementation partner by ID
     */
    static async getPartnerById(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params;
            const partner = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await (prisma.implementationBasicInformation.findUnique as any)({
                    where: { id },
                    include: {
                        contactPersons: true,
                        businessDetails: true,
                        relations: true,
                        documents: true,
                    }
                });
            });

            if (!partner) {
                res.status(404).json({ success: false, error: 'Implementation partner not found' } as ApiResponse);
                return;
            }

            res.status(200).json({ success: true, data: partner } as ApiResponse);
        } catch (error) {
            console.error('Get Implementation Partner by ID error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch implementation partner' } as ApiResponse);
        }
    }

    /**
     * Create a new implementation partner with all sections and document uploads
     */
    static async createPartner(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' } as ApiResponse);
                return;
            }

            const data: CreateImplementationPartnerData = req.body;
            const { contactPersons, businessDetails, relations, documents, ...basicInfo } = data;

            if (!basicInfo.companyName) {
                res.status(400).json({ success: false, error: 'Company name is required' } as ApiResponse);
                return;
            }

            const result = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                // Use a transaction to ensure all related records are created together
                return await prisma.$transaction(async (tx) => {
                    // 1. Create Basic Information
                    const partner = await tx.implementationBasicInformation.create({
                        data: {
                            ...basicInfo,
                            tenantId: req.tenantId!,
                        }
                    });

                    // 2. Create Contact Persons
                    if (contactPersons && contactPersons.length > 0) {
                        await tx.implementationContactPerson.createMany({
                            data: contactPersons.map(cp => ({
                                ...cp,
                                implementationId: partner.id,
                                createdById: req.user!.id,
                                updatedById: req.user!.id
                            }))
                        });
                    }

                    // 3. Create Business Details
                    if (businessDetails && businessDetails.length > 0) {
                        await tx.implementationBusinessDetailes.createMany({
                            data: businessDetails.map(bd => ({
                                ...bd,
                                yearEstabliliesh: bd.yearEstabliliesh ? parseInt(bd.yearEstabliliesh.toString(), 10) : null,
                                totalEmployees: bd.totalEmployees ? parseInt(bd.totalEmployees.toString(), 10) : null,
                                implementationId: partner.id,
                                createdById: req.user!.id,
                                updatedById: req.user!.id
                            }))
                        });
                    }

                    // 4. Create Relations
                    if (relations && relations.length > 0) {
                        await tx.implementationRelations.createMany({
                            data: relations.map(rel => ({
                                ...rel,
                                implementationId: partner.id,
                                createdById: req.user!.id,
                                updatedById: req.user!.id
                            }))
                        });
                    }

                    // 5. Handle Documents (Upload to R2 first)
                    if (documents && documents.length > 0) {
                        const documentRecords = [];
                        for (const doc of documents) {
                            if (doc.base64 && doc.fileName) {
                                // Upload to R2 - passing tenantId and partner.id as ticketId for grouping
                                const uploadResult = await uploadFileToR2(
                                    doc.base64,
                                    doc.fileName,
                                    req.tenantId!,
                                    partner.id
                                );

                                documentRecords.push({
                                    implementationId: partner.id,
                                    documentType: doc.documentType || 'Other',
                                    documentUrl: uploadResult.fileUrl,
                                    createdById: req.user!.id,
                                    updatedById: req.user!.id
                                });
                            } else if (doc.documentUrl) {
                                // Already uploaded or external URL
                                documentRecords.push({
                                    implementationId: partner.id,
                                    documentType: doc.documentType || 'Other',
                                    documentUrl: doc.documentUrl,
                                    createdById: req.user!.id,
                                    updatedById: req.user!.id
                                });
                            }
                        }

                        if (documentRecords.length > 0) {
                            await tx.implementationDocument.createMany({
                                data: documentRecords
                            });
                        }
                    }

                    return partner;
                });
            });

            res.status(201).json({ success: true, data: result, message: 'Implementation partner created successfully' } as ApiResponse);
        } catch (error) {
            console.error('Create Implementation Partner error:', error);
            res.status(500).json({ success: false, error: 'Failed to create implementation partner' } as ApiResponse);
        }
    }

    /**
     * Update an implementation partner
     */
    static async updatePartner(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' } as ApiResponse);
                return;
            }

            const { id } = req.params;
            const data: UpdateImplementationPartnerData = req.body;
            const { contactPersons, businessDetails, relations, documents, ...basicInfo } = data;

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.$transaction(async (tx) => {
                    // 1. Update Basic Information
                    await tx.implementationBasicInformation.update({
                        where: { id },
                        data: basicInfo
                    });

                    // 2. Update Contact Persons (Delete and Re-create for simplicity in a "sync" approach, or use more complex logic)
                    if (contactPersons) {
                        await tx.implementationContactPerson.deleteMany({ where: { implementationId: id } });
                        if (contactPersons.length > 0) {
                            await tx.implementationContactPerson.createMany({
                                data: contactPersons.map(cp => ({
                                    ...cp,
                                    implementationId: id,
                                    createdById: req.user!.id,
                                    updatedById: req.user!.id
                                }))
                            });
                        }
                    }

                    // 3. Update Business Details
                    if (businessDetails) {
                        await tx.implementationBusinessDetailes.deleteMany({ where: { implementationId: id } });
                        if (businessDetails.length > 0) {
                            await tx.implementationBusinessDetailes.createMany({
                                data: businessDetails.map(bd => ({
                                    ...bd,
                                    yearEstabliliesh: bd.yearEstabliliesh ? parseInt(bd.yearEstabliliesh.toString(), 10) : null,
                                    totalEmployees: bd.totalEmployees ? parseInt(bd.totalEmployees.toString(), 10) : null,
                                    implementationId: id,
                                    createdById: req.user!.id,
                                    updatedById: req.user!.id
                                }))
                            });
                        }
                    }

                    // 4. Update Relations
                    if (relations) {
                        await tx.implementationRelations.deleteMany({ where: { implementationId: id } });
                        if (relations.length > 0) {
                            await tx.implementationRelations.createMany({
                                data: relations.map(rel => ({
                                    ...rel,
                                    implementationId: id,
                                    createdById: req.user!.id,
                                    updatedById: req.user!.id
                                }))
                            });
                        }
                    }

                    // 5. Update Documents
                    if (documents) {
                        // For documents, we might want to be more careful.
                        // Here we'll delete and re-create, but ideally we'd manage deletion from R2 for removed files.
                        // Simple version for now:
                        await tx.implementationDocument.deleteMany({ where: { implementationId: id } });

                        const documentRecords = [];
                        for (const doc of documents) {
                            if (doc.base64 && doc.fileName) {
                                const uploadResult = await uploadFileToR2(
                                    doc.base64,
                                    doc.fileName,
                                    req.tenantId!,
                                    id
                                );
                                documentRecords.push({
                                    implementationId: id,
                                    documentType: doc.documentType || 'Other',
                                    documentUrl: uploadResult.fileUrl,
                                    createdById: req.user!.id,
                                    updatedById: req.user!.id
                                });
                            } else if (doc.documentUrl) {
                                documentRecords.push({
                                    implementationId: id,
                                    documentType: doc.documentType || 'Other',
                                    documentUrl: doc.documentUrl,
                                    createdById: req.user!.id,
                                    updatedById: req.user!.id
                                });
                            }
                        }

                        if (documentRecords.length > 0) {
                            await tx.implementationDocument.createMany({
                                data: documentRecords
                            });
                        }
                    }
                });
            });

            res.status(200).json({ success: true, message: 'Implementation partner updated successfully' } as ApiResponse);
        } catch (error) {
            console.error('Update Implementation Partner error:', error);
            res.status(500).json({ success: false, error: 'Failed to update implementation partner' } as ApiResponse);
        }
    }

    /**
     * Delete an implementation partner
     */
    static async deletePartner(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params;

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.$transaction(async (tx) => {
                    // Delete related records first (cascade should ideally handle this, but explicit is safer)
                    await tx.implementationContactPerson.deleteMany({ where: { implementationId: id } });
                    await tx.implementationBusinessDetailes.deleteMany({ where: { implementationId: id } });
                    await tx.implementationRelations.deleteMany({ where: { implementationId: id } });

                    // Handle document deletion from R2
                    const documents = await tx.implementationDocument.findMany({ where: { implementationId: id } });
                    for (const doc of documents) {
                        if (doc.documentUrl) {
                            try {
                                await deleteFileFromR2(doc.documentUrl, req.tenantId!);
                            } catch (error) {
                                console.error(`Failed to delete file from R2: ${doc.documentUrl}`, error);
                            }
                        }
                    }
                    await tx.implementationDocument.deleteMany({ where: { implementationId: id } });

                    // Finally delete basic information
                    await tx.implementationBasicInformation.delete({ where: { id } });
                });
            });

            res.status(200).json({ success: true, message: 'Implementation partner deleted successfully' } as ApiResponse);
        } catch (error) {
            console.error('Delete Implementation Partner error:', error);
            res.status(500).json({ success: false, error: 'Failed to delete implementation partner' } as ApiResponse);
        }
    }

    /**
     * Add a contact person to an implementation partner
     */
    static async addContact(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' } as ApiResponse);
                return;
            }

            const { id } = req.params;
            const contactData = req.body;

            const newContact = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.implementationContactPerson.create({
                    data: {
                        ...contactData,
                        implementationId: id,
                        createdById: req.user!.id,
                        updatedById: req.user!.id
                    }
                });
            });

            res.status(201).json({ success: true, data: newContact, message: 'Contact added successfully' } as ApiResponse);
        } catch (error) {
            console.error('Add Contact error:', error);
            res.status(500).json({ success: false, error: 'Failed to add contact' } as ApiResponse);
        }
    }

    /**
     * Delete a contact person
     */
    static async deleteContact(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { contactId } = req.params;

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                await prisma.implementationContactPerson.delete({
                    where: { id: contactId }
                });
            });

            res.status(200).json({ success: true, message: 'Contact deleted successfully' } as ApiResponse);
        } catch (error) {
            console.error('Delete Contact error:', error);
            res.status(500).json({ success: false, error: 'Failed to delete contact' } as ApiResponse);
        }
    }

    /**
     * Delete a document
     */
    static async deleteDocument(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { documentId } = req.params;

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const document = await prisma.implementationDocument.findUnique({
                    where: { id: documentId }
                });

                if (document?.documentUrl) {
                    try {
                        await deleteFileFromR2(document.documentUrl, req.tenantId!);
                    } catch (error) {
                        console.error(`Failed to delete file from R2: ${document.documentUrl}`, error);
                    }
                }

                await prisma.implementationDocument.delete({
                    where: { id: documentId }
                });
            });

            res.status(200).json({ success: true, message: 'Document deleted successfully' } as ApiResponse);
        } catch (error) {
            console.error('Delete Document error:', error);
            res.status(500).json({ success: false, error: 'Failed to delete document' } as ApiResponse);
        }
    }

    /**
     * Add a document to an implementation partner
     */
    static async addDocument(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' } as ApiResponse);
                return;
            }

            const { id } = req.params;
            const { base64, fileName, documentType } = req.body;

            if (!base64 || !fileName) {
                res.status(400).json({ success: false, error: 'File data and name are required' } as ApiResponse);
                return;
            }

            // Upload to R2
            const uploadResult = await uploadFileToR2(
                base64,
                fileName,
                req.tenantId!,
                id
            );

            // Create record in database
            const newDocument = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.implementationDocument.create({
                    data: {
                        implementationId: id,
                        documentType: documentType || 'Other',
                        documentUrl: uploadResult.fileUrl,
                        createdById: req.user!.id,
                        updatedById: req.user!.id
                    }
                });
            });

            res.status(201).json({ success: true, data: newDocument, message: 'Document added successfully' } as ApiResponse);
        } catch (error) {
            console.error('Add Document error:', error);
            res.status(500).json({ success: false, error: 'Failed to add document' } as ApiResponse);
        }
    }

    /**
     * Get assigned clients for an implementation partner
     */
    static async getAssignedClients(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params;

            const clients = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const partner = (await prisma.implementationBasicInformation.findUnique({
                    where: { id },
                    select: { clientIds: true } as any
                })) as any;

                if (!partner || !partner.clientIds || partner.clientIds.length === 0) return [];

                return await (prisma.recruitmentClientBasicInformation as any).findMany({
                    where: {
                        id: { in: partner.clientIds },
                        tenantId: req.tenantId
                    },
                    include: {
                        contacts: true
                    }
                });
            });

            res.status(200).json({ success: true, data: clients } as ApiResponse);
        } catch (error) {
            console.error('Get Assigned Clients error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch assigned clients' } as ApiResponse);
        }
    }

    /**
     * Assign a client to an implementation partner
     */
    static async assignClient(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params; // partnerId
            const { clientId } = req.body;

            if (!clientId) {
                res.status(400).json({ success: false, error: 'Client ID is required' } as ApiResponse);
                return;
            }

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.$transaction(async (tx) => {
                    // 1. Update Implementation Partner's clientIds array
                    const partner = (await tx.implementationBasicInformation.findUnique({
                        where: { id },
                        select: { clientIds: true } as any
                    })) as any;

                    if (!partner) throw new Error('Implementation partner not found');

                    const currentClientIds = (partner.clientIds as string[]) || [];
                    if (!currentClientIds.includes(clientId)) {
                        await (tx.implementationBasicInformation as any).update({
                            where: { id },
                            data: {
                                clientIds: {
                                    push: clientId
                                }
                            }
                        });
                    }

                    // 2. Update Recruitment Client's implementationPartnerId
                    const client = (await tx.recruitmentClientBasicInformation.findUnique({
                        where: { id: clientId },
                        select: { implementationPartnerId: true } as any
                    })) as any;

                    if (client) {
                        const currentPartnerIds = (client.implementationPartnerId as string[]) || [];
                        if (!currentPartnerIds.includes(id)) {
                            await (tx.recruitmentClientBasicInformation as any).update({
                                where: { id: clientId },
                                data: {
                                    implementationPartnerId: { push: id }
                                }
                            });
                        }
                    }
                });
            });

            res.status(200).json({ success: true, message: 'Client assigned successfully' } as ApiResponse);
        } catch (error) {
            console.error('Assign Client error:', error);
            res.status(500).json({ success: false, error: 'Failed to assign client' } as ApiResponse);
        }
    }

    /**
     * Remove a client from an implementation partner
     */
    static async removeClient(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params; // partnerId
            const { clientId } = req.body;

            if (!clientId) {
                res.status(400).json({ success: false, error: 'Client ID is required' } as ApiResponse);
                return;
            }

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.$transaction(async (tx) => {
                    // 1. Update Implementation Partner's clientIds array
                    const partner = (await tx.implementationBasicInformation.findUnique({
                        where: { id },
                        select: { clientIds: true } as any
                    })) as any;

                    if (!partner) throw new Error('Implementation partner not found');

                    const updatedClientIds = ((partner.clientIds as string[]) || []).filter(cid => cid !== clientId);

                    await (tx.implementationBasicInformation as any).update({
                        where: { id },
                        data: {
                            clientIds: { set: updatedClientIds }
                        }
                    });

                    // 2. Update Recruitment Client's implementationPartnerId
                    const client = (await tx.recruitmentClientBasicInformation.findUnique({
                        where: { id: clientId },
                        select: { implementationPartnerId: true } as any
                    })) as any;

                    if (client) {
                        const currentPartnerIds = (client.implementationPartnerId as string[]) || [];
                        const updatedPartnerIds = currentPartnerIds.filter((pid: string) => pid !== id);

                        await (tx.recruitmentClientBasicInformation as any).update({
                            where: { id: clientId },
                            data: {
                                implementationPartnerId: { set: updatedPartnerIds }
                            }
                        });
                    }
                });
            });

            res.status(200).json({ success: true, message: 'Client removed successfully' } as ApiResponse);
        } catch (error) {
            console.error('Remove Client error:', error);
            res.status(500).json({ success: false, error: 'Failed to remove client' } as ApiResponse);
        }
    }

    /**
     * Get assigned vendors for an implementation partner
     */
    static async getAssignedVendors(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params;

            const vendors = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma: any) => {
                const partner = (await prisma.implementationBasicInformation.findUnique({
                    where: { id },
                    select: { vendorIds: true } as any
                })) as any;

                if (!partner || !partner.vendorIds || partner.vendorIds.length === 0) return [];

                return await (prisma.vendorBasicInformation as any).findMany({
                    where: {
                        id: { in: partner.vendorIds },
                        tenantId: req.tenantId
                    },
                    include: {
                        contactPersons: true
                    }
                });
            });

            res.status(200).json({ success: true, data: vendors } as ApiResponse);
        } catch (error) {
            console.error('Get Assigned Vendors error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch assigned vendors' } as ApiResponse);
        }
    }

    /**
     * Assign a vendor to an implementation partner
     */
    static async assignVendor(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params; // partnerId
            const { vendorId } = req.body;

            if (!vendorId) {
                res.status(400).json({ success: false, error: 'Vendor ID is required' } as ApiResponse);
                return;
            }

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma: any) => {
                return await prisma.$transaction(async (tx: any) => {
                    const partner = (await tx.implementationBasicInformation.findUnique({
                        where: { id },
                        select: { vendorIds: true } as any
                    })) as any;

                    if (!partner) throw new Error('Implementation partner not found');

                    const currentVendorIds = (partner.vendorIds as string[]) || [];
                    if (!currentVendorIds.includes(vendorId)) {
                        await (tx.implementationBasicInformation as any).update({
                            where: { id },
                            data: {
                                vendorIds: {
                                    push: vendorId
                                }
                            }
                        });
                    }

                    // 2. Update Vendor's implementationIds array
                    const vendor = (await tx.vendorBasicInformation.findUnique({
                        where: { id: vendorId },
                        select: { implementationIds: true } as any
                    })) as any;

                    if (vendor) {
                        const currentPartnerIds = (vendor.implementationIds as string[]) || [];
                        if (!currentPartnerIds.includes(id)) {
                            await (tx.vendorBasicInformation as any).update({
                                where: { id: vendorId },
                                data: {
                                    implementationIds: { push: id }
                                }
                            });
                        }
                    }
                });
            });

            res.status(200).json({ success: true, message: 'Vendor assigned successfully' } as ApiResponse);
        } catch (error) {
            console.error('Assign Vendor error:', error);
            res.status(500).json({ success: false, error: 'Failed to assign vendor' } as ApiResponse);
        }
    }

    /**
     * Remove a vendor from an implementation partner
     */
    static async removeVendor(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params; // partnerId
            const { vendorId } = req.body;

            if (!vendorId) {
                res.status(400).json({ success: false, error: 'Vendor ID is required' } as ApiResponse);
                return;
            }

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma: any) => {
                return await prisma.$transaction(async (tx: any) => {
                    const partner = (await tx.implementationBasicInformation.findUnique({
                        where: { id },
                        select: { vendorIds: true } as any
                    })) as any;

                    if (!partner) throw new Error('Implementation partner not found');

                    const currentVendorIds = (partner.vendorIds as string[]) || [];
                    const updatedVendorIds = currentVendorIds.filter((vid: string) => vid !== vendorId);

                    await (tx.implementationBasicInformation as any).update({
                        where: { id },
                        data: {
                            vendorIds: { set: updatedVendorIds }
                        }
                    });

                    // 2. Update Vendor's implementationIds array
                    const vendor = (await tx.vendorBasicInformation.findUnique({
                        where: { id: vendorId },
                        select: { implementationIds: true } as any
                    })) as any;

                    if (vendor) {
                        const currentPartnerIds = (vendor.implementationIds as string[]) || [];
                        const updatedPartnerIds = currentPartnerIds.filter((pid: string) => pid !== id);

                        await (tx.vendorBasicInformation as any).update({
                            where: { id: vendorId },
                            data: {
                                implementationIds: { set: updatedPartnerIds }
                            }
                        });
                    }
                });
            });

            res.status(200).json({ success: true, message: 'Vendor removed successfully' } as ApiResponse);
        } catch (error) {
            console.error('Remove Vendor error:', error);
            res.status(500).json({ success: false, error: 'Failed to remove vendor' } as ApiResponse);
        }
    }

    /**
     * Get implementation partners for select/dropdown
     */
    static async getPartnersForSelect(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const partners = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.implementationBasicInformation.findMany({
                    where: { tenantId: req.tenantId!, status: true },
                    select: {
                        id: true,
                        companyName: true
                    },
                    orderBy: { companyName: 'asc' }
                });
            });

            res.status(200).json({
                success: true,
                data: partners.map(p => ({
                    value: p.id,
                    label: p.companyName || 'Unnamed Partner'
                }))
            } as ApiResponse);
        } catch (error) {
            console.error('Get Implementation Partners for Select error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch implementation partners' } as ApiResponse);
        }
    }
}
