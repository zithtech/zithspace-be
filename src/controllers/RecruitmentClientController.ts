import { Response } from 'express';
import { tenantAwarePrisma } from '@/config/database';
import { AuthRequest } from '../types';
import { entitlementService } from '@/services/EntitlementService';
import {
    ApiResponse,
    CreateRecruitmentClientData,
    UpdateRecruitmentClientData
} from '@/types';

export class RecruitmentClientController {
    /**
     * Get all recruitment clients with pagination and filters
     */
    static async getClients(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { page = 1, limit = 20, search, industry } = req.query;
            const where: any = { tenantId: req.tenantId };

            if (search) {
                where.clientName = { contains: search as string, mode: 'insensitive' };
            }
            if (industry) {
                where.industry = industry as string;
            }

            const skip = (Number(page) - 1) * Number(limit);

            const [clients, total] = await Promise.all([
                tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                    return await prisma.recruitmentClientBasicInformation.findMany({
                        where,
                        include: {
                            businessDetails: true,
                            hiringPreferences: true,
                            contacts: true
                        },
                        orderBy: { createdAt: 'desc' },
                        skip,
                        take: Number(limit),
                    });
                }),
                tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                    return await prisma.recruitmentClientBasicInformation.count({ where });
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
            console.error('Get Recruitment Clients error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch recruitment clients' } as ApiResponse);
        }
    }

    /**
     * Get a single recruitment client by ID
     */
    static async getClientById(req: AuthRequest, res: Response): Promise<void> {
        try {
            console.log(`GET /recruitment-client/${req.params.id} called for tenant:`, req.tenantId);
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params;
            const result = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const client = await prisma.recruitmentClientBasicInformation.findUnique({
                    where: { id },
                    include: {
                        businessDetails: true,
                        hiringPreferences: true,
                        contacts: true
                    }
                });

                return client;
            });

            if (!result) {
                res.status(404).json({ success: false, error: 'Recruitment client not found' } as ApiResponse);
                return;
            }

            res.status(200).json({ success: true, data: result } as ApiResponse);
        } catch (error) {
            console.error('Get Recruitment Client by ID error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch recruitment client' } as ApiResponse);
        }
    }

    /**
     * Create a new recruitment client with sections
     */
    static async createClient(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' } as ApiResponse);
                return;
            }

            const data = req.body;

            // Enforce Clients limit
            await entitlementService.checkLimit(req.tenantId, 'clients');

            const { businessDetails, hiringPreferences, contacts, ...basicInfo } = data;

            if (typeof basicInfo.implementationPartnerId === 'string') {
                basicInfo.implementationPartnerId = [basicInfo.implementationPartnerId];
            } else if (!basicInfo.implementationPartnerId) {
                basicInfo.implementationPartnerId = [];
            }

            if (typeof basicInfo.primeVendorId === 'string') {
                basicInfo.primeVendorId = [basicInfo.primeVendorId];
            } else if (!basicInfo.primeVendorId) {
                basicInfo.primeVendorId = [];
            }

            if (!basicInfo.clientName) {
                res.status(400).json({ success: false, error: 'Client name is required' } as ApiResponse);
                return;
            }

            const result = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.$transaction(async (tx) => {
                    // 1. Create Basic Information
                    const client = await tx.recruitmentClientBasicInformation.create({
                        data: {
                            ...basicInfo,
                            tenantId: req.tenantId!,
                            createdById: req.user!.id,
                            updatedById: req.user!.id
                        }
                    });

                    // 2. Create Business Details
                    if (businessDetails && businessDetails.length > 0) {
                        await tx.recruitmentClientBusinessDetails.createMany({
                            data: businessDetails.map((bd: any) => {
                                const { id, ...bdData } = bd;
                                return {
                                    ...bdData,
                                    companyName: bdData.companyName || bdData.companySize || "N/A",
                                    yearEstablished: bdData.yearEstablished ? Number(bdData.yearEstablished) : undefined,
                                    revenueRange: bdData.revenueRange,
                                    recruitmentClientId: client.id,
                                    createdById: req.user!.id,
                                    updatedById: req.user!.id
                                };
                            })
                        });
                    }

                    // 3. Create Hiring Preferences
                    if (hiringPreferences && hiringPreferences.length > 0) {
                        await tx.recruitmentClientHiringPreference.createMany({
                            data: hiringPreferences.map((hp: any) => {
                                const { id, ...hpData } = hp;
                                return {
                                    ...hpData,
                                    recruitmentId: client.id,
                                };
                            })
                        });
                    }

                    // 4. Create Contacts
                    if (contacts && contacts.length > 0) {
                        await tx.recruitmentClientContact.createMany({
                            data: contacts.map((c: any) => {
                                const { id, ...contactData } = c;
                                return {
                                    ...contactData,
                                    recruitmentClientId: client.id
                                };
                            })
                        });
                    }

                    return client;
                });
            });

            res.status(201).json({ success: true, data: result, message: 'Recruitment client created successfully' } as ApiResponse);
        } catch (error: any) {
            console.error('Create Recruitment Client error:', error);
            if (error.name === 'EntitlementError') {
                res.status(403).json({ success: false, error: error.message, details: { current: error.current, allowed: error.allowed } } as any);
                return;
            }
            res.status(500).json({ success: false, error: 'Failed to create recruitment client' } as ApiResponse);
        }
    }

    /**
     * Update a recruitment client
     */
    static async updateClient(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' } as ApiResponse);
                return;
            }

            const { id } = req.params;
            const data = req.body;
            const { businessDetails, hiringPreferences, contacts, ...basicInfo } = data;

            if (typeof basicInfo.implementationPartnerId === 'string') {
                basicInfo.implementationPartnerId = { set: [basicInfo.implementationPartnerId] };
            } else if (Array.isArray(basicInfo.implementationPartnerId)) {
                basicInfo.implementationPartnerId = { set: basicInfo.implementationPartnerId };
            } else {
                basicInfo.implementationPartnerId = { set: [] };
            }

            if (typeof basicInfo.primeVendorId === 'string') {
                basicInfo.primeVendorId = { set: [basicInfo.primeVendorId] };
            } else if (Array.isArray(basicInfo.primeVendorId)) {
                basicInfo.primeVendorId = { set: basicInfo.primeVendorId };
            } else {
                basicInfo.primeVendorId = { set: [] };
            }

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.$transaction(async (tx) => {
                    // 1. Update Basic Information
                    await tx.recruitmentClientBasicInformation.update({
                        where: { id },
                        data: {
                            ...basicInfo,
                            updatedById: req.user!.id
                        }
                    });

                    // 2. Update Business Details (Sync approach)
                    if (businessDetails) {
                        await tx.recruitmentClientBusinessDetails.deleteMany({ where: { recruitmentClientId: id } });
                        if (businessDetails.length > 0) {
                            await tx.recruitmentClientBusinessDetails.createMany({
                                data: businessDetails.map(bd => ({
                                    companyName: (bd as any).companyName || (bd as any).companySize || "N/A",
                                    yearEstablished: bd.yearEstablished ? Number(bd.yearEstablished) : undefined,
                                    revenueRange: bd.revenueRange,
                                    recruitmentClientId: id,
                                    createdById: req.user!.id,
                                    updatedById: req.user!.id
                                }))
                            });
                        }
                    }

                    // 3. Update Hiring Preferences
                    if (hiringPreferences) {
                        await tx.recruitmentClientHiringPreference.deleteMany({ where: { recruitmentId: id } });
                        if (hiringPreferences.length > 0) {
                            await tx.recruitmentClientHiringPreference.createMany({
                                data: hiringPreferences.map(hp => ({
                                    employmentType: hp.employmentType,
                                    workType: hp.workType,
                                    hiringLocation: hp.hiringLocation,
                                    recruitmentId: id,
                                }))
                            });
                        }
                    }


                    // 5. Update Contacts
                    if (contacts) {
                        await tx.recruitmentClientContact.deleteMany({ where: { recruitmentClientId: id } });
                        if (contacts.length > 0) {
                            await tx.recruitmentClientContact.createMany({
                                data: contacts.map((c: any) => {
                                    const { id: contactId, ...contactData } = c;
                                    return {
                                        ...contactData,
                                        recruitmentClientId: id
                                    };
                                })
                            });
                        }
                    }

                });
            });

            res.status(200).json({ success: true, message: 'Recruitment client updated successfully' } as ApiResponse);
        } catch (error) {
            console.error('Update Recruitment Client error:', error);
            res.status(500).json({ success: false, error: 'Failed to update recruitment client' } as ApiResponse);
        }
    }

    /**
     * Delete a recruitment client
     */
    static async deleteClient(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params;

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.$transaction(async (tx) => {
                    // Delete related records
                    await tx.recruitmentClientBusinessDetails.deleteMany({ where: { recruitmentClientId: id } });
                    await tx.recruitmentClientHiringPreference.deleteMany({ where: { recruitmentId: id } });

                    // Delete basic info
                    await tx.recruitmentClientBasicInformation.delete({ where: { id } });
                });
            });

            res.status(200).json({ success: true, message: 'Recruitment client deleted successfully' } as ApiResponse);
        } catch (error) {
            console.error('Delete Recruitment Client error:', error);
            res.status(500).json({ success: false, error: 'Failed to delete recruitment client' } as ApiResponse);
        }
    }

    static async addContact(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id: recruitmentClientId } = req.params;
            const data = req.body;

            const result = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.recruitmentClientContact.create({
                    data: {
                        ...data,
                        recruitmentClientId
                    }
                });
            });

            res.status(201).json({ success: true, data: result } as ApiResponse);
        } catch (error) {
            console.error('Add contact error:', error);
            res.status(500).json({ success: false, error: 'Failed to add contact' } as ApiResponse);
        }
    }

    static async deleteContact(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { contactId } = req.params;

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                await prisma.recruitmentClientContact.delete({
                    where: { id: contactId }
                });
            });

            res.status(200).json({ success: true, message: 'Contact deleted successfully' } as ApiResponse);
        } catch (error) {
            console.error('Delete contact error:', error);
            res.status(500).json({ success: false, error: 'Failed to delete contact' } as ApiResponse);
        }
    }

    /**
     * Get assigned partners for a client
     */
    static async getAssignedPartners(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params;

            const partners = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const client = (await prisma.recruitmentClientBasicInformation.findUnique({
                    where: { id },
                    select: { implementationPartnerId: true } as any
                })) as any;

                if (!client || !client.implementationPartnerId || client.implementationPartnerId.length === 0) return [];

                return await (prisma.implementationBasicInformation as any).findMany({
                    where: {
                        id: { in: client.implementationPartnerId },
                        tenantId: req.tenantId
                    },
                    include: {
                        contactPersons: true
                    }
                });
            });

            res.status(200).json({ success: true, data: partners } as ApiResponse);
        } catch (error) {
            console.error('Get Assigned Partners error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch assigned partners' } as ApiResponse);
        }
    }

    /**
     * Get assigned vendors for a client
     */
    static async getAssignedVendors(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params;

            const vendors = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                const client = (await prisma.recruitmentClientBasicInformation.findUnique({
                    where: { id },
                    select: { primeVendorId: true } as any
                })) as any;

                if (!client || !client.primeVendorId || client.primeVendorId.length === 0) return [];

                return await (prisma.vendorBasicInformation as any).findMany({
                    where: {
                        id: { in: client.primeVendorId },
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
     * Assign a partner to a client
     */
    static async assignPartner(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params; // clientId
            const { partnerId } = req.body;

            if (!partnerId) {
                res.status(400).json({ success: false, error: 'Partner ID is required' } as ApiResponse);
                return;
            }

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.$transaction(async (tx) => {
                    // 1. Update Client's implementationPartnerId array
                    const client = (await tx.recruitmentClientBasicInformation.findUnique({
                        where: { id },
                        select: { implementationPartnerId: true } as any
                    })) as any;

                    if (!client) throw new Error('Client not found');

                    const currentPartnerIds = (client.implementationPartnerId as string[]) || [];
                    if (!currentPartnerIds.includes(partnerId)) {
                        await (tx.recruitmentClientBasicInformation as any).update({
                            where: { id },
                            data: {
                                implementationPartnerId: { push: partnerId }
                            }
                        });
                    }

                    // 2. Update Partner's clientIds array
                    const partner = (await tx.implementationBasicInformation.findUnique({
                        where: { id: partnerId },
                        select: { clientIds: true } as any
                    })) as any;

                    if (partner) {
                        const currentClientIds = (partner.clientIds as string[]) || [];
                        if (!currentClientIds.includes(id)) {
                            await (tx.implementationBasicInformation as any).update({
                                where: { id: partnerId },
                                data: {
                                    clientIds: { push: id }
                                }
                            });
                        }
                    }
                });
            });

            res.status(200).json({ success: true, message: 'Partner assigned successfully' } as ApiResponse);
        } catch (error) {
            console.error('Assign Partner error:', error);
            res.status(500).json({ success: false, error: 'Failed to assign partner' } as ApiResponse);
        }
    }

    /**
     * Remove a partner from a client
     */
    static async removePartner(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params; // clientId
            const { partnerId } = req.body;

            if (!partnerId) {
                res.status(400).json({ success: false, error: 'Partner ID is required' } as ApiResponse);
                return;
            }

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.$transaction(async (tx) => {
                    // 1. Update Client's implementationPartnerId array
                    const client = (await tx.recruitmentClientBasicInformation.findUnique({
                        where: { id },
                        select: { implementationPartnerId: true } as any
                    })) as any;

                    if (!client) throw new Error('Client not found');

                    const updatedPartnerIds = ((client.implementationPartnerId as string[]) || []).filter(pid => pid !== partnerId);
                    await (tx.recruitmentClientBasicInformation as any).update({
                        where: { id },
                        data: {
                            implementationPartnerId: { set: updatedPartnerIds }
                        }
                    });

                    // 2. Update Partner's clientIds array
                    const partner = (await tx.implementationBasicInformation.findUnique({
                        where: { id: partnerId },
                        select: { clientIds: true } as any
                    })) as any;

                    if (partner) {
                        const currentClientIds = (partner.clientIds as string[]) || [];
                        const updatedClientIds = currentClientIds.filter(cid => cid !== id);
                        await (tx.implementationBasicInformation as any).update({
                            where: { id: partnerId },
                            data: {
                                clientIds: { set: updatedClientIds }
                            }
                        });
                    }
                });
            });

            res.status(200).json({ success: true, message: 'Partner removed successfully' } as ApiResponse);
        } catch (error) {
            console.error('Remove Partner error:', error);
            res.status(500).json({ success: false, error: 'Failed to remove partner' } as ApiResponse);
        }
    }

    /**
     * Assign a vendor to a client
     */
    static async assignVendor(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params; // clientId
            const { vendorId } = req.body;

            if (!vendorId) {
                res.status(400).json({ success: false, error: 'Vendor ID is required' } as ApiResponse);
                return;
            }

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.$transaction(async (tx) => {
                    // 1. Update Client's primeVendorId array
                    const client = (await tx.recruitmentClientBasicInformation.findUnique({
                        where: { id },
                        select: { primeVendorId: true } as any
                    })) as any;

                    if (!client) throw new Error('Client not found');

                    const currentVendorIds = (client.primeVendorId as string[]) || [];
                    if (!currentVendorIds.includes(vendorId)) {
                        await (tx.recruitmentClientBasicInformation as any).update({
                            where: { id },
                            data: {
                                primeVendorId: { push: vendorId }
                            }
                        });
                    }

                    // 2. Update Vendor's clientIds array
                    const vendor = (await tx.vendorBasicInformation.findUnique({
                        where: { id: vendorId },
                        select: { clientIds: true } as any
                    })) as any;

                    if (vendor) {
                        const currentClientIds = (vendor.clientIds as string[]) || [];
                        if (!currentClientIds.includes(id)) {
                            await (tx.vendorBasicInformation as any).update({
                                where: { id: vendorId },
                                data: {
                                    clientIds: { push: id }
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
     * Remove a vendor from a client
     */
    static async removeVendor(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const { id } = req.params; // clientId
            const { vendorId } = req.body;

            if (!vendorId) {
                res.status(400).json({ success: false, error: 'Vendor ID is required' } as ApiResponse);
                return;
            }

            await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.$transaction(async (tx) => {
                    // 1. Update Client's primeVendorId array
                    const client = (await tx.recruitmentClientBasicInformation.findUnique({
                        where: { id },
                        select: { primeVendorId: true } as any
                    })) as any;

                    if (!client) throw new Error('Client not found');

                    const updatedVendorIds = ((client.primeVendorId as string[]) || []).filter(vid => vid !== vendorId);
                    await (tx.recruitmentClientBasicInformation as any).update({
                        where: { id },
                        data: {
                            primeVendorId: { set: updatedVendorIds }
                        }
                    });

                    // 2. Update Vendor's clientIds array
                    const vendor = (await tx.vendorBasicInformation.findUnique({
                        where: { id: vendorId },
                        select: { clientIds: true } as any
                    })) as any;

                    if (vendor) {
                        const currentClientIds = (vendor.clientIds as string[]) || [];
                        const updatedClientIds = currentClientIds.filter(cid => cid !== id);
                        await (tx.vendorBasicInformation as any).update({
                            where: { id: vendorId },
                            data: {
                                clientIds: { set: updatedClientIds }
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
     * Get recruitment clients for select/dropdown
     */
    static async getClientsForSelect(req: AuthRequest, res: Response): Promise<void> {
        try {
            console.log('GET /recruitment-client/select called for tenant:', req.tenantId);
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
                return;
            }

            const clients = await tenantAwarePrisma.withTenant(req.tenantId, async (prisma) => {
                return await prisma.recruitmentClientBasicInformation.findMany({
                    where: { tenantId: req.tenantId!, status: true },
                    select: {
                        id: true,
                        clientName: true
                    },
                    orderBy: { clientName: 'asc' }
                });
            });
            console.log(`Found ${clients.length} recruitment clients for select`);

            res.status(200).json({
                success: true,
                data: clients.map(c => ({
                    value: c.id,
                    label: c.clientName || 'Unnamed Client'
                }))
            } as ApiResponse);
        } catch (error) {
            console.error('Get Recruitment Clients for Select error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch recruitment clients' } as ApiResponse);
        }
    }
}
