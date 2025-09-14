import { Router } from 'express';
import { ClientController } from '@/controllers/clientController';
import { authenticateToken, requireAuth, requireAdmin } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/clients/stats
 * @desc    Get client statistics (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/stats', ClientController.getClientStats);

/**
 * @route   GET /api/clients/select
 * @desc    Get clients for dropdown/select (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/select', ClientController.getClientsForSelect);

/**
 * @route   GET /api/clients/search
 * @desc    Search clients (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   q, limit
 */
router.get('/search', ClientController.searchClients);

/**
 * @route   GET /api/clients
 * @desc    Get all clients with filtering, pagination, and search (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, search, status, sortBy, sortOrder
 */
router.get('/', ClientController.getClients);

/**
 * @route   GET /api/clients/:id
 * @desc    Get client by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Client ID
 */
router.get('/:id', ClientController.getClientById);

/**
 * @route   POST /api/clients
 * @desc    Create new client (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    CreateClientData
 */
router.post('/', ClientController.createClient);

/**
 * @route   PUT /api/clients/:id
 * @desc    Update client (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Client ID
 * @body    UpdateClientData
 */
router.put('/:id', ClientController.updateClient);

/**
 * @route   DELETE /api/clients/:id
 * @desc    Delete client (soft delete - tenant-aware)
 * @access  Private (admin only)
 * @param   id - Client ID
 */
router.delete('/:id', requireAdmin, ClientController.deleteClient);

/**
 * @route   PATCH /api/clients/bulk/status
 * @desc    Bulk update client status (tenant-aware)
 * @access  Private (admin only)
 * @body    { clientIds: string[], isActive: boolean }
 */
router.patch('/bulk/status', requireAdmin, ClientController.bulkUpdateClientStatus);

export default router;
