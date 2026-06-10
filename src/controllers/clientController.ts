import { Response } from 'express';
import { 
  AuthRequest, 
  ApiResponse, 
  NotFoundError, 
  ValidationError,
  CreateClientData,
  UpdateClientData
} from '@/types';
import {
  getClients as modelGetClients,
  getClientById as modelGetClientById,
  getClientByEmail as modelGetClientByEmail,
  createClient as modelCreateClient,
  updateClient as modelUpdateClient,
  deleteClient as modelDeleteClient,
  getClientStats as modelGetClientStats,
  getClientsForSelect as modelGetClientsForSelect,
  bulkUpdateClientStatus as modelBulkUpdateClientStatus,
  searchClients as modelSearchClients
} from '../models/client.model';

export class ClientController {
  /**
   * Get all clients with filtering, pagination, and search (tenant-aware)
   */
  static async getClients(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const {
        page = 1,
        limit = 20,
        search,
        status,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const { clients, total } = await modelGetClients(req.tenantId, {
        page: Number(page),
        limit: Number(limit),
        search: search as string,
        status: status as string,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
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
      } as ApiResponse);
    } catch (error) {
      console.error('Get clients error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch clients'
      } as ApiResponse);
    }
  }

  /**
   * Get client by ID (tenant-aware)
   */
  static async getClientById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const client = await modelGetClientById(id, req.tenantId);

      if (!client) {
        res.status(404).json({
          success: false,
          error: 'Client not found'
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: client
      } as ApiResponse);
    } catch (error) {
      console.error('Get client by ID error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch client'
      } as ApiResponse);
    }
  }

  /**
   * Create new client (tenant-aware)
   */
  static async createClient(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const clientData: CreateClientData = req.body;

      // Validate required fields
      if (!clientData.name || !clientData.email) {
        res.status(400).json({
          success: false,
          error: 'Name and email are required'
        } as ApiResponse);
        return;
      }

      // Check if client with same email already exists within tenant
      if (clientData.email) {
        const existingClient = await modelGetClientByEmail(clientData.email, req.tenantId);
        if (existingClient && existingClient.isActive) {
          throw new ValidationError('Client with this email already exists in this tenant');
        }
      }

      // Create new client
      const newClient = await modelCreateClient(req.tenantId, req.user.id, clientData);

      res.status(201).json({
        success: true,
        data: newClient,
        message: 'Client created successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Create client error:', error);
      
      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create client'
      } as ApiResponse);
    }
  }

  /**
   * Update client (tenant-aware)
   */
  static async updateClient(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const updates = req.body as UpdateClientData;

      // Remove fields that shouldn't be updated directly
      delete updates.createdById;
      delete updates.createdAt;
      delete updates.tenantId;

      // Check if client exists and belongs to tenant
      const existingClient = await modelGetClientById(id, req.tenantId);

      if (!existingClient) {
        throw new NotFoundError('Client not found in this tenant');
      }

      // If email is being updated, check for duplicates within tenant
      if (updates.email && updates.email.toLowerCase() !== existingClient.email) {
        const duplicateClient = await modelGetClientByEmail(updates.email, req.tenantId);

        if (duplicateClient && duplicateClient.id !== id && duplicateClient.isActive) {
          throw new ValidationError('Client with this email already exists in this tenant');
        }
        updates.email = updates.email.toLowerCase();
      }

      const updatedClient = await modelUpdateClient(id, req.tenantId, updates);

      res.status(200).json({
        success: true,
        data: updatedClient,
        message: 'Client updated successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Update client error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update client'
      } as ApiResponse);
    }
  }

  /**
   * Delete client (soft delete - tenant-aware)
   */
  static async deleteClient(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const existingClient = await modelGetClientById(id, req.tenantId);

      if (!existingClient) {
        throw new NotFoundError('Client not found in this tenant');
      }

      // Soft delete
      await modelDeleteClient(id, req.tenantId);

      res.status(200).json({
        success: true,
        message: 'Client deleted successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Delete client error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to delete client'
      } as ApiResponse);
    }
  }

  /**
   * Get client statistics (tenant-aware)
   */
  static async getClientStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const stats = await modelGetClientStats(req.tenantId);

      res.status(200).json({
        success: true,
        data: stats
      } as ApiResponse);
    } catch (error) {
      console.error('Get client stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch client statistics'
      } as ApiResponse);
    }
  }

  /**
   * Get clients for dropdown/select (tenant-aware)
   */
  static async getClientsForSelect(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const formattedClients = await modelGetClientsForSelect(req.tenantId);

      res.status(200).json({
        success: true,
        data: formattedClients
      } as ApiResponse);
    } catch (error) {
      console.error('Get clients for select error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch clients'
      } as ApiResponse);
    }
  }

  /**
   * Bulk update client status (tenant-aware)
   */
  static async bulkUpdateClientStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { clientIds, isActive } = req.body;

      if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Client IDs are required'
        } as ApiResponse);
        return;
      }

      if (typeof isActive !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'Status (isActive) is required'
        } as ApiResponse);
        return;
      }

      const count = await modelBulkUpdateClientStatus(clientIds, isActive, req.tenantId);

      res.status(200).json({
        success: true,
        message: `${count} clients updated successfully`,
        data: { modifiedCount: count }
      } as ApiResponse);
    } catch (error) {
      console.error('Bulk update clients error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update clients'
      } as ApiResponse);
    }
  }

  /**
   * Search clients (tenant-aware)
   */
  static async searchClients(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { q, limit = 10 } = req.query;

      if (!q) {
        res.status(400).json({
          success: false,
          error: 'Search query is required'
        } as ApiResponse);
        return;
      }

      const clients = await modelSearchClients(req.tenantId, q as string, Number(limit));

      res.status(200).json({
        success: true,
        data: clients
      } as ApiResponse);
    } catch (error) {
      console.error('Search clients error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search clients'
      } as ApiResponse);
    }
  }
}

export default ClientController;
