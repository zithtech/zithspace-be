import { Response } from 'express';
import { tenantAwarePrisma } from '@/config/database';
import {
    AuthRequest,
    ApiResponse,
    CreateVendorData,
    UpdateVendorData
} from '@/types';
import { uploadFileToR2, deleteFileFromR2 } from '@/utils/r2Client';

export class VendorController {
    /**
     * Get all vendors with pagination and filters
     */
    static async getVendors(req: AuthRequest, res: Response): Promise<void> {
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

            const [vendors, total] = await Promise.all([
                tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                    return await prisma.vendorBasicInformation.findMany({
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
                    return await prisma.vendorBasicInformation.count({ where });
                })
            ]);

            res.status(200).json({
                success: true,
                data: vendors,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / Number(limit))
                }
            } as ApiResponse);
        } catch (error: any) {
            console.error('Error in getVendors:', error);
            res.status(500).json({ success: false, error: error.message } as ApiResponse);
        }
    }

    /**
     * Get vendor by ID
     */
    static async getVendorById(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const vendor = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.vendorBasicInformation.findFirst({
                    where: { id, tenantId: req.tenantId },
                    include: {
                        contactPersons: true,
                        businessDetails: true,
                        relations: true,
                        documents: true,
                    }
                });
            });

            if (!vendor) {
                res.status(404).json({ success: false, error: 'Vendor not found' } as ApiResponse);
                return;
            }

            res.status(200).json({ success: true, data: vendor } as ApiResponse);
        } catch (error: any) {
            console.error('Error in getVendorById:', error);
            res.status(500).json({ success: false, error: error.message } as ApiResponse);
        }
    }

    /**
     * Create a new vendor
     */
    static async createVendor(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const data = req.body as CreateVendorData;
            
            const result = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.$transaction(async (tx) => {
                    // Create base vendor
                    const vendor = await tx.vendorBasicInformation.create({
                        data: {
                            tenantId: req.tenantId!,
                            companyName: data.companyName,
                            industry: data.industry,
                            website: data.website,
                            companyEmail: data.companyEmail,
                            companyPhone: data.companyPhone,
                            status: data.status ?? true,
                            street: data.street,
                            city: data.city,
                            state: data.state,
                            country: data.country,
                            zipCode: data.zipCode,
                            notes: data.notes,
                            createdById: req.user?.id
                        }
                    });

                    // Add contact persons
                    if (data.contactPersons && data.contactPersons.length > 0) {
                        await tx.vendorContactPerson.createMany({
                            data: data.contactPersons.map(contact => ({
                                ...contact,
                                vendorId: vendor.id
                            }))
                        });
                    }

                    // Add business details
                    if (data.businessDetails && data.businessDetails.length > 0) {
                        await tx.vendorBusinessDetailes.createMany({
                            data: data.businessDetails.map(detail => ({
                                ...detail,
                                yearEstabliliesh: detail.yearEstabliliesh ? parseInt(detail.yearEstabliliesh.toString(), 10) : null,
                                totalEmployees: detail.totalEmployees ? parseInt(detail.totalEmployees.toString(), 10) : null,
                                vendorId: vendor.id
                            }))
                        });
                    }

                    // Add relations
                    if (data.relations && data.relations.length > 0) {
                        await tx.vendorRelations.createMany({
                            data: data.relations.map(relation => ({
                                ...relation,
                                vendorId: vendor.id
                            }))
                        });
                    }

                    // Handle documents
                    if (data.documents && data.documents.length > 0) {
                        for (const doc of data.documents) {
                            if (doc.base64 && doc.fileName) {
                                const uploadResult = await uploadFileToR2(
                                    doc.base64,
                                    doc.fileName,
                                    req.tenantId!,
                                    vendor.id
                                );
                                
                                await tx.vendorDocument.create({
                                    data: {
                                        vendorId: vendor.id,
                                        documentType: doc.documentType || 'Other',
                                        documentUrl: uploadResult.fileUrl
                                    }
                                });
                            }
                        }
                    }

                    return vendor;
                });
            });

            res.status(201).json({ success: true, data: result } as ApiResponse);
        } catch (error: any) {
            console.error('Error in createVendor:', error);
            res.status(500).json({ success: false, error: error.message } as ApiResponse);
        }
    }

    /**
     * Update an existing vendor
     */
    static async updateVendor(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const data = req.body as UpdateVendorData;

            const result = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.$transaction(async (tx) => {
                    // Update basic info
                    const vendor = await tx.vendorBasicInformation.update({
                        where: { id, tenantId: req.tenantId },
                        data: {
                            companyName: data.companyName,
                            industry: data.industry,
                            website: data.website,
                            companyEmail: data.companyEmail,
                            companyPhone: data.companyPhone,
                            status: data.status,
                            street: data.street,
                            city: data.city,
                            state: data.state,
                            country: data.country,
                            zipCode: data.zipCode,
                            notes: data.notes,
                            updatedById: req.user?.id
                        }
                    });

                    // Update sub-records (replace pattern)
                    if (data.contactPersons) {
                        await tx.vendorContactPerson.deleteMany({ where: { vendorId: id } });
                        if (data.contactPersons.length > 0) {
                            await tx.vendorContactPerson.createMany({
                                data: data.contactPersons.map(c => ({ 
                                    ...c, 
                                    vendorId: id
                                }))
                            });
                        }
                    }

                    if (data.businessDetails) {
                        await tx.vendorBusinessDetailes.deleteMany({ where: { vendorId: id } });
                        if (data.businessDetails.length > 0) {
                            await tx.vendorBusinessDetailes.createMany({
                                data: data.businessDetails.map(d => ({ 
                                    ...d, 
                                    yearEstabliliesh: d.yearEstabliliesh ? parseInt(d.yearEstabliliesh.toString(), 10) : null,
                                    totalEmployees: d.totalEmployees ? parseInt(d.totalEmployees.toString(), 10) : null,
                                    vendorId: id
                                }))
                            });
                        }
                    }

                    if (data.relations) {
                        await tx.vendorRelations.deleteMany({ where: { vendorId: id } });
                        if (data.relations.length > 0) {
                            await tx.vendorRelations.createMany({
                                data: data.relations.map(r => ({ 
                                    ...r, 
                                    vendorId: id
                                }))
                            });
                        }
                    }

                    // Handle new documents
                    if (data.documents && data.documents.length > 0) {
                        for (const doc of data.documents) {
                            if (doc.base64 && doc.fileName) {
                                const uploadResult = await uploadFileToR2(
                                    doc.base64,
                                    doc.fileName,
                                    req.tenantId!,
                                    id
                                );
                                
                                await tx.vendorDocument.create({
                                    data: {
                                        vendorId: id,
                                        documentType: doc.documentType || 'Other',
                                        documentUrl: uploadResult.fileUrl
                                    }
                                });
                            }
                        }
                    }

                    return vendor;
                });
            });

            res.status(200).json({ success: true, data: result } as ApiResponse);
        } catch (error: any) {
            console.error('Error in updateVendor:', error);
            res.status(500).json({ success: false, error: error.message } as ApiResponse);
        }
    }

    /**
     * Delete a vendor
     */
    static async deleteVendor(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const documents = await prisma.vendorDocument.findMany({ where: { vendorId: id } });
                
                await prisma.$transaction(async (tx) => {
                    await tx.vendorContactPerson.deleteMany({ where: { vendorId: id } });
                    await tx.vendorBusinessDetailes.deleteMany({ where: { vendorId: id } });
                    await tx.vendorRelations.deleteMany({ where: { vendorId: id } });
                    await tx.vendorDocument.deleteMany({ where: { vendorId: id } });
                    await tx.vendorBasicInformation.delete({ where: { id, tenantId: req.tenantId } });
                });

                // Cleanup R2
                for (const doc of documents) {
                    if (doc.documentUrl) {
                        try {
                            await deleteFileFromR2(doc.documentUrl, req.tenantId!);
                        } catch (err) {
                            console.error(`Failed to delete file from R2: ${doc.documentUrl}`, err);
                        }
                    }
                }
            });

            res.status(200).json({ success: true, message: 'Vendor deleted successfully' } as ApiResponse);
        } catch (error: any) {
            console.error('Error in deleteVendor:', error);
            res.status(500).json({ success: false, error: error.message } as ApiResponse);
        }
    }

    /**
     * Add a single contact to a vendor
     */
    static async addContact(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const data = req.body;
            const contact = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.vendorContactPerson.create({
                    data: { 
                        ...data, 
                        vendorId: id
                    }
                });
            });

            res.status(201).json({ success: true, data: contact, message: 'Contact added successfully' } as ApiResponse);
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message } as ApiResponse);
        }
    }

    /**
     * Delete a single contact
     */
    static async deleteContact(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { contactId } = req.params;
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                await prisma.vendorContactPerson.delete({ where: { id: contactId } });
            });

            res.status(200).json({ success: true, message: 'Contact deleted successfully' } as ApiResponse);
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message } as ApiResponse);
        }
    }

    /**
     * Add a single document
     */
    static async addDocument(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const { base64, fileName, documentType } = req.body;
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            if (!base64 || !fileName) {
                 res.status(400).json({ success: false, error: 'Missing file data' } as ApiResponse);
                 return;
            }

            const uploadResult = await uploadFileToR2(
                base64,
                fileName,
                req.tenantId!,
                id
            );

            const document = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.vendorDocument.create({
                    data: {
                        vendorId: id,
                        documentType: documentType || 'Other',
                        documentUrl: uploadResult.fileUrl
                    }
                });
            });

            res.status(201).json({ success: true, data: document, message: 'Document uploaded successfully' } as ApiResponse);
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message } as ApiResponse);
        }
    }

    /**
     * Delete a single document
     */
    static async deleteDocument(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { documentId } = req.params;
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const document = await prisma.vendorDocument.findUnique({ where: { id: documentId } });
                if (document?.documentUrl) {
                    try {
                        await deleteFileFromR2(document.documentUrl, req.tenantId!);
                    } catch (err) {
                        console.error(`Failed to delete file from R2: ${document.documentUrl}`, err);
                    }
                }
                await prisma.vendorDocument.delete({ where: { id: documentId } });
            });

            res.status(200).json({ success: true, message: 'Document deleted successfully' } as ApiResponse);
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message } as ApiResponse);
        }
    }

    /**
     * Get assigned clients for a vendor
     */
    static async getAssignedClients(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params; // vendorId

            const vendor = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return (await prisma.vendorBasicInformation.findUnique({
                    where: { id },
                    select: { clientIds: true } as any
                })) as any;
            });

            if (!vendor || !vendor.clientIds || vendor.clientIds.length === 0) {
                res.status(200).json({ success: true, data: [] } as ApiResponse);
                return;
            }

            const clients = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.recruitmentClientBasicInformation.findMany({
                    where: {
                        id: { in: vendor.clientIds },
                        tenantId: req.tenantId
                    },
                    include: {
                        contacts: true
                    }
                });
            });

            res.status(200).json({ success: true, data: clients } as ApiResponse);
        } catch (error: any) {
            console.error('Get Assigned Clients error:', error);
            res.status(500).json({ success: false, error: error.message } as ApiResponse);
        }
    }

    /**
     * Assign a client to a vendor
     */
    static async assignClient(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params; // vendorId
            const { clientId } = req.body;

            if (!clientId) {
                res.status(400).json({ success: false, error: 'Client ID is required' } as ApiResponse);
                return;
            }

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.$transaction(async (tx) => {
                    // 1. Update Vendor's clientIds array
                    const vendor = (await tx.vendorBasicInformation.findUnique({
                        where: { id },
                        select: { clientIds: true } as any
                    })) as any;

                    if (vendor) {
                        const currentClientIds = (vendor.clientIds as string[]) || [];
                        if (!currentClientIds.includes(clientId)) {
                            await (tx.vendorBasicInformation as any).update({
                                where: { id },
                                data: {
                                    clientIds: { push: clientId }
                                }
                            });
                        }
                    }

                    // 2. Update Client's primeVendorId array
                    const client = (await tx.recruitmentClientBasicInformation.findUnique({
                        where: { id: clientId },
                        select: { primeVendorId: true } as any
                    })) as any;

                    if (client) {
                        const currentVendorIds = (client.primeVendorId as string[]) || [];
                        if (!currentVendorIds.includes(id)) {
                            await (tx.recruitmentClientBasicInformation as any).update({
                                where: { id: clientId },
                                data: {
                                    primeVendorId: { push: id }
                                }
                            });
                        }
                    }
                });
            });

            res.status(200).json({ success: true, message: 'Client assigned successfully' } as ApiResponse);
        } catch (error: any) {
            console.error('Assign Client error:', error);
            res.status(500).json({ success: false, error: error.message } as ApiResponse);
        }
    }

    /**
     * Remove a client from a vendor
     */
    static async removeClient(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params; // vendorId
            const { clientId } = req.body;

            if (!clientId) {
                res.status(400).json({ success: false, error: 'Client ID is required' } as ApiResponse);
                return;
            }

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.$transaction(async (tx) => {
                    // 1. Update Vendor's clientIds array
                    const vendor = (await tx.vendorBasicInformation.findUnique({
                        where: { id },
                        select: { clientIds: true } as any
                    })) as any;

                    if (vendor) {
                        const updatedClientIds = ((vendor.clientIds as string[]) || []).filter((cid: string) => cid !== clientId);
                        await (tx.vendorBasicInformation as any).update({
                            where: { id },
                            data: {
                                clientIds: { set: updatedClientIds }
                            }
                        });
                    }

                    // 2. Update Client's primeVendorId
                    const client = (await tx.recruitmentClientBasicInformation.findUnique({
                        where: { id: clientId },
                        select: { primeVendorId: true } as any
                    })) as any;

                    if (client) {
                        const currentVendorIds = (client.primeVendorId as string[]) || [];
                        const updatedVendorIds = currentVendorIds.filter((vid: string) => vid !== id);

                        await (tx.recruitmentClientBasicInformation as any).update({
                            where: { id: clientId },
                            data: {
                                primeVendorId: { set: updatedVendorIds }
                            }
                        });
                    }
                });
            });

            res.status(200).json({ success: true, message: 'Client removed successfully' } as ApiResponse);
        } catch (error: any) {
            console.error('Remove Client error:', error);
            res.status(500).json({ success: false, error: error.message } as ApiResponse);
        }
    }

    /**
     * Get assigned partners for a vendor
     */
    static async getAssignedPartners(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params; // vendorId

            const vendor = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return (await prisma.vendorBasicInformation.findUnique({
                    where: { id },
                    select: { implementationIds: true } as any
                })) as any;
            });

            if (!vendor || !vendor.implementationIds || vendor.implementationIds.length === 0) {
                res.status(200).json({ success: true, data: [] } as ApiResponse);
                return;
            }

            const partners = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await (prisma.implementationBasicInformation.findMany as any)({
                    where: {
                        id: { in: vendor.implementationIds },
                        tenantId: req.tenantId
                    },
                    include: {
                        contactPersons: true
                    }
                });
            });

            res.status(200).json({ success: true, data: partners } as ApiResponse);
        } catch (error: any) {
            console.error('Get Assigned Partners error:', error);
            res.status(500).json({ success: false, error: error.message } as ApiResponse);
        }
    }

    /**
     * Assign a partner to a vendor
     */
    static async assignPartner(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params; // vendorId
            const { partnerId } = req.body;

            if (!partnerId) {
                res.status(400).json({ success: false, error: 'Partner ID is required' } as ApiResponse);
                return;
            }

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.$transaction(async (tx) => {
                    // 1. Update Vendor's implementationIds array
                    const vendor = (await tx.vendorBasicInformation.findUnique({
                        where: { id },
                        select: { implementationIds: true } as any
                    })) as any;

                    if (vendor) {
                        const currentPartnerIds = (vendor.implementationIds as string[]) || [];
                        if (!currentPartnerIds.includes(partnerId)) {
                            await (tx.vendorBasicInformation as any).update({
                                where: { id },
                                data: {
                                    implementationIds: { push: partnerId }
                                }
                            });
                        }
                    }

                    // 2. Update Partner's vendorIds array
                    const partner = (await tx.implementationBasicInformation.findUnique({
                        where: { id: partnerId },
                        select: { vendorIds: true } as any
                    })) as any;

                    if (partner) {
                        const currentVendorIds = (partner.vendorIds as string[]) || [];
                        if (!currentVendorIds.includes(id)) {
                            await (tx.implementationBasicInformation as any).update({
                                where: { id: partnerId },
                                data: {
                                    vendorIds: { push: id }
                                }
                            });
                        }
                    }
                });
            });

            res.status(200).json({ success: true, message: 'Partner assigned successfully' } as ApiResponse);
        } catch (error: any) {
            console.error('Assign Partner error:', error);
            res.status(500).json({ success: false, error: error.message } as ApiResponse);
        }
    }

    /**
     * Remove a partner from a vendor
     */
    static async removePartner(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params; // vendorId
            const { partnerId } = req.body;

            if (!partnerId) {
                res.status(400).json({ success: false, error: 'Partner ID is required' } as ApiResponse);
                return;
            }

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.$transaction(async (tx) => {
                    // 1. Update Vendor's implementationIds array
                    const vendor = (await tx.vendorBasicInformation.findUnique({
                        where: { id },
                        select: { implementationIds: true } as any
                    })) as any;

                    if (vendor) {
                        const updatedPartnerIds = ((vendor.implementationIds as string[]) || []).filter((pid: string) => pid !== partnerId);
                        await (tx.vendorBasicInformation as any).update({
                            where: { id },
                            data: {
                                implementationIds: { set: updatedPartnerIds }
                            }
                        });
                    }

                    // 2. Update Partner's vendorIds
                    const partner = (await tx.implementationBasicInformation.findUnique({
                        where: { id: partnerId },
                        select: { vendorIds: true } as any
                    })) as any;

                    if (partner) {
                        const currentVendorIds = (partner.vendorIds as string[]) || [];
                        const updatedVendorIds = currentVendorIds.filter((vid: string) => vid !== id);

                        await (tx.implementationBasicInformation as any).update({
                            where: { id: partnerId },
                            data: {
                                vendorIds: { set: updatedVendorIds }
                            }
                        });
                    }
                });
            });

            res.status(200).json({ success: true, message: 'Partner removed successfully' } as ApiResponse);
        } catch (error: any) {
            console.error('Remove Partner error:', error);
            res.status(500).json({ success: false, error: error.message } as ApiResponse);
        }
    }

    /**
     * Get vendors for select/dropdown
     */
    static async getVendorsForSelect(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const vendors = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.vendorBasicInformation.findMany({
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
                data: vendors.map(v => ({
                    value: v.id,
                    label: v.companyName || 'Unnamed Vendor'
                }))
            } as ApiResponse);
        } catch (error) {
            console.error('Get Vendors for Select error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch vendors' } as ApiResponse);
        }
    }
}
