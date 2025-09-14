import { Response } from 'express';
import { tenantAwarePrisma } from '@/config/database';
import { 
  AuthRequest, 
  ApiResponse, 
  NotFoundError, 
  ValidationError,
  CreateClientData,
  UpdateClientData
} from '@/types';

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

      // Build filter query
      const where: any = {
        tenantId: req.tenantId,
        isActive: true,
      };

      // Search functionality
      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
          { company: { contains: search as string, mode: 'insensitive' } },
          { contactPerson: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      // Apply filters
      if (status) where.isActive = status === 'active';

      // Build sort object
      const orderBy: any = {};
      orderBy[sortBy as string] = sortOrder === 'desc' ? 'desc' : 'asc';

      // Execute query with pagination
      const skip = (Number(page) - 1) * Number(limit);
      
      const [clients, total] = await Promise.all([
        tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
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
        tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
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

      const client = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
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

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Check if client with same email already exists within tenant
        const existingClient = await client.client.findFirst({
          where: {
            email: clientData.email.toLowerCase(),
            tenantId: req.tenantId,
            isActive: true
          }
        });

        if (existingClient) {
          throw new ValidationError('Client with this email already exists in this tenant');
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
            createdById: req.user!.id,
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
        } as ApiResponse);
      });
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

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Check if client exists and belongs to tenant
        const existingClient = await client.client.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          }
        });

        if (!existingClient) {
          throw new NotFoundError('Client not found in this tenant');
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
            throw new ValidationError('Client with this email already exists in this tenant');
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
        } as ApiResponse);
      });
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

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const existingClient = await client.client.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          }
        });

        if (!existingClient) {
          throw new NotFoundError('Client not found in this tenant');
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
        } as ApiResponse);
      });
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

      const stats = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
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

      const clients = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
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

      const result = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
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

      const clients = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        return await client.client.findMany({
          where: {
            tenantId: req.tenantId,
            isActive: true,
            OR: [
              { name: { contains: q as string, mode: 'insensitive' } },
              { email: { contains: q as string, mode: 'insensitive' } },
              { company: { contains: q as string, mode: 'insensitive' } },
              { contactPerson: { contains: q as string, mode: 'insensitive' } }
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
