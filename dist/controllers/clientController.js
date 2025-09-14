"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
class ClientController {
    /**
     * Get all clients with filtering, pagination, and search (tenant-aware)
     */
    static async getClients(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { page = 1, limit = 20, search, status, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
            // Build filter query
            const where = {
                tenantId: req.tenantId,
                isActive: true,
            };
            // Search functionality
            if (search) {
                where.OR = [
                    { name: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { company: { contains: search, mode: 'insensitive' } },
                    { contactPerson: { contains: search, mode: 'insensitive' } }
                ];
            }
            // Apply filters
            if (status)
                where.isActive = status === 'active';
            // Build sort object
            const orderBy = {};
            orderBy[sortBy] = sortOrder === 'desc' ? 'desc' : 'asc';
            // Execute query with pagination
            const skip = (Number(page) - 1) * Number(limit);
            const [clients, total] = await Promise.all([
                database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                    return await client.client.findMany({
                        where,
                        include: {
                            createdBy: {
                                select: { id: true, name: true, workEmail: true }
                            }
                        },
                        orderBy,
                        skip,
                        take: Number(limit),
                    });
                }),
                database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                    return await client.client.count({ where });
                })
            ]);
            const totalPages = Math.ceil(total / Number(limit));
            res.status(200).json({
                success: true,
                data: clients,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: totalPages,
                    hasNext: Number(page) < totalPages,
                    hasPrev: Number(page) > 1
                }
            });
        }
        catch (error) {
            console.error('Get clients error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch clients'
            });
        }
    }
    /**
     * Get client by ID (tenant-aware)
     */
    static async getClientById(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const client = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                return await client.client.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    },
                    include: {
                        createdBy: {
                            select: { id: true, name: true, workEmail: true }
                        }
                    }
                });
            });
            if (!client) {
                res.status(404).json({
                    success: false,
                    error: 'Client not found'
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: client
            });
        }
        catch (error) {
            console.error('Get client by ID error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch client'
            });
        }
    }
    /**
     * Create new client (tenant-aware)
     */
    static async createClient(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const clientData = req.body;
            // Validate required fields
            if (!clientData.name || !clientData.email) {
                res.status(400).json({
                    success: false,
                    error: 'Name and email are required'
                });
                return;
            }
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Check if client with same email already exists within tenant
                const existingClient = await client.client.findFirst({
                    where: {
                        email: clientData.email.toLowerCase(),
                        tenantId: req.tenantId,
                        isActive: true
                    }
                });
                if (existingClient) {
                    throw new types_1.ValidationError('Client with this email already exists in this tenant');
                }
                // Create new client
                const newClient = await client.client.create({
                    data: {
                        tenantId: req.tenantId,
                        name: clientData.name,
                        email: clientData.email.toLowerCase(),
                        phone: clientData.phone,
                        company: clientData.company,
                        address: clientData.address,
                        contactPerson: clientData.contactPerson,
                        notes: clientData.notes,
                        createdById: req.user.id,
                    },
                    include: {
                        createdBy: {
                            select: { id: true, name: true, workEmail: true }
                        }
                    }
                });
                res.status(201).json({
                    success: true,
                    data: newClient,
                    message: 'Client created successfully'
                });
            });
        }
        catch (error) {
            console.error('Create client error:', error);
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to create client'
            });
        }
    }
    /**
     * Update client (tenant-aware)
     */
    static async updateClient(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const updates = req.body;
            // Remove fields that shouldn't be updated directly
            delete updates.createdById;
            delete updates.createdAt;
            delete updates.tenantId;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Check if client exists and belongs to tenant
                const existingClient = await client.client.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!existingClient) {
                    throw new types_1.NotFoundError('Client not found in this tenant');
                }
                // If email is being updated, check for duplicates within tenant
                if (updates.email && updates.email.toLowerCase() !== existingClient.email) {
                    const duplicateClient = await client.client.findFirst({
                        where: {
                            email: updates.email.toLowerCase(),
                            tenantId: req.tenantId,
                            id: { not: id },
                            isActive: true
                        }
                    });
                    if (duplicateClient) {
                        throw new types_1.ValidationError('Client with this email already exists in this tenant');
                    }
                    updates.email = updates.email.toLowerCase();
                }
                const updatedClient = await client.client.update({
                    where: { id },
                    data: {
                        ...updates,
                        updatedAt: new Date()
                    },
                    include: {
                        createdBy: {
                            select: { id: true, name: true, workEmail: true }
                        }
                    }
                });
                res.status(200).json({
                    success: true,
                    data: updatedClient,
                    message: 'Client updated successfully'
                });
            });
        }
        catch (error) {
            console.error('Update client error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to update client'
            });
        }
    }
    /**
     * Delete client (soft delete - tenant-aware)
     */
    static async deleteClient(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                const existingClient = await client.client.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!existingClient) {
                    throw new types_1.NotFoundError('Client not found in this tenant');
                }
                // Soft delete
                await client.client.update({
                    where: { id },
                    data: {
                        isActive: false,
                        updatedAt: new Date()
                    }
                });
                res.status(200).json({
                    success: true,
                    message: 'Client deleted successfully'
                });
            });
        }
        catch (error) {
            console.error('Delete client error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to delete client'
            });
        }
    }
    /**
     * Get client statistics (tenant-aware)
     */
    static async getClientStats(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const stats = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                const [totalClients, activeClients, recentClients] = await Promise.all([
                    client.client.count({
                        where: { tenantId: req.tenantId }
                    }),
                    client.client.count({
                        where: { tenantId: req.tenantId, isActive: true }
                    }),
                    client.client.findMany({
                        where: { tenantId: req.tenantId, isActive: true },
                        include: {
                            createdBy: {
                                select: { name: true }
                            }
                        },
                        orderBy: { createdAt: 'desc' },
                        take: 10
                    })
                ]);
                const inactiveClients = totalClients - activeClients;
                return {
                    overview: {
                        totalClients,
                        activeClients,
                        inactiveClients
                    },
                    recentClients
                };
            });
            res.status(200).json({
                success: true,
                data: stats
            });
        }
        catch (error) {
            console.error('Get client stats error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch client statistics'
            });
        }
    }
    /**
     * Get clients for dropdown/select (tenant-aware)
     */
    static async getClientsForSelect(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const clients = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                return await client.client.findMany({
                    where: {
                        tenantId: req.tenantId,
                        isActive: true
                    },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        company: true,
                        contactPerson: true,
                    },
                    orderBy: { name: 'asc' }
                });
            });
            const formattedClients = clients.map(client => ({
                value: client.id,
                label: client.name,
                email: client.email,
                company: client.company,
                contactPerson: client.contactPerson,
            }));
            res.status(200).json({
                success: true,
                data: formattedClients
            });
        }
        catch (error) {
            console.error('Get clients for select error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch clients'
            });
        }
    }
    /**
     * Bulk update client status (tenant-aware)
     */
    static async bulkUpdateClientStatus(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { clientIds, isActive } = req.body;
            if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'Client IDs are required'
                });
                return;
            }
            if (typeof isActive !== 'boolean') {
                res.status(400).json({
                    success: false,
                    error: 'Status (isActive) is required'
                });
                return;
            }
            const result = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                return await client.client.updateMany({
                    where: {
                        id: { in: clientIds },
                        tenantId: req.tenantId,
                    },
                    data: {
                        isActive,
                        updatedAt: new Date()
                    }
                });
            });
            res.status(200).json({
                success: true,
                message: `${result.count} clients updated successfully`,
                data: { modifiedCount: result.count }
            });
        }
        catch (error) {
            console.error('Bulk update clients error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update clients'
            });
        }
    }
    /**
     * Search clients (tenant-aware)
     */
    static async searchClients(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { q, limit = 10 } = req.query;
            if (!q) {
                res.status(400).json({
                    success: false,
                    error: 'Search query is required'
                });
                return;
            }
            const clients = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                return await client.client.findMany({
                    where: {
                        tenantId: req.tenantId,
                        isActive: true,
                        OR: [
                            { name: { contains: q, mode: 'insensitive' } },
                            { email: { contains: q, mode: 'insensitive' } },
                            { company: { contains: q, mode: 'insensitive' } },
                            { contactPerson: { contains: q, mode: 'insensitive' } }
                        ]
                    },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        company: true,
                        contactPerson: true,
                    },
                    take: Number(limit),
                    orderBy: { name: 'asc' }
                });
            });
            res.status(200).json({
                success: true,
                data: clients
            });
        }
        catch (error) {
            console.error('Search clients error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to search clients'
            });
        }
    }
}
exports.ClientController = ClientController;
exports.default = ClientController;
//# sourceMappingURL=clientController.js.map