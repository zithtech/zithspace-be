"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientController = void 0;
const types_1 = require("@/types");
const EntitlementService_1 = require("@/services/EntitlementService");
const client_model_1 = require("../models/client.model");
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
            const { clients, total } = await (0, client_model_1.getClients)(req.tenantId, {
                page: Number(page),
                limit: Number(limit),
                search: search,
                status: status,
                sortBy: sortBy,
                sortOrder: sortOrder,
            });
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
            const client = await (0, client_model_1.getClientById)(id, req.tenantId);
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
            // Enforce Clients limit
            await EntitlementService_1.entitlementService.checkLimit(req.tenantId, 'clients');
            // Validate required fields
            if (!clientData.name || !clientData.email) {
                res.status(400).json({
                    success: false,
                    error: 'Name and email are required'
                });
                return;
            }
            // Check if client with same email already exists within tenant
            if (clientData.email) {
                const existingClient = await (0, client_model_1.getClientByEmail)(clientData.email, req.tenantId);
                if (existingClient && existingClient.isActive) {
                    throw new types_1.ValidationError('Client with this email already exists in this tenant');
                }
            }
            // Create new client
            const newClient = await (0, client_model_1.createClient)(req.tenantId, req.user.id, clientData);
            res.status(201).json({
                success: true,
                data: newClient,
                message: 'Client created successfully'
            });
        }
        catch (error) {
            console.error('Create client error:', error);
            if (error.name === 'EntitlementError') {
                res.status(403).json({
                    success: false,
                    error: error.message,
                    details: { current: error.current, allowed: error.allowed }
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
            // Check if client exists and belongs to tenant
            const existingClient = await (0, client_model_1.getClientById)(id, req.tenantId);
            if (!existingClient) {
                throw new types_1.NotFoundError('Client not found in this tenant');
            }
            // If email is being updated, check for duplicates within tenant
            if (updates.email && updates.email.toLowerCase() !== existingClient.email) {
                const duplicateClient = await (0, client_model_1.getClientByEmail)(updates.email, req.tenantId);
                if (duplicateClient && duplicateClient.id !== id && duplicateClient.isActive) {
                    throw new types_1.ValidationError('Client with this email already exists in this tenant');
                }
                updates.email = updates.email.toLowerCase();
            }
            const updatedClient = await (0, client_model_1.updateClient)(id, req.tenantId, updates);
            res.status(200).json({
                success: true,
                data: updatedClient,
                message: 'Client updated successfully'
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
            const existingClient = await (0, client_model_1.getClientById)(id, req.tenantId);
            if (!existingClient) {
                throw new types_1.NotFoundError('Client not found in this tenant');
            }
            // Soft delete
            await (0, client_model_1.deleteClient)(id, req.tenantId);
            res.status(200).json({
                success: true,
                message: 'Client deleted successfully'
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
            const stats = await (0, client_model_1.getClientStats)(req.tenantId);
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
            const formattedClients = await (0, client_model_1.getClientsForSelect)(req.tenantId);
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
            const count = await (0, client_model_1.bulkUpdateClientStatus)(clientIds, isActive, req.tenantId);
            res.status(200).json({
                success: true,
                message: `${count} clients updated successfully`,
                data: { modifiedCount: count }
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
            const clients = await (0, client_model_1.searchClients)(req.tenantId, q, Number(limit));
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