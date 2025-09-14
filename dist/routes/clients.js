"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const clientController_1 = require("@/controllers/clientController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/**
 * @route   GET /api/clients/stats
 * @desc    Get client statistics (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/stats', clientController_1.ClientController.getClientStats);
/**
 * @route   GET /api/clients/select
 * @desc    Get clients for dropdown/select (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/select', clientController_1.ClientController.getClientsForSelect);
/**
 * @route   GET /api/clients/search
 * @desc    Search clients (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   q, limit
 */
router.get('/search', clientController_1.ClientController.searchClients);
/**
 * @route   GET /api/clients
 * @desc    Get all clients with filtering, pagination, and search (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, search, status, sortBy, sortOrder
 */
router.get('/', clientController_1.ClientController.getClients);
/**
 * @route   GET /api/clients/:id
 * @desc    Get client by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Client ID
 */
router.get('/:id', clientController_1.ClientController.getClientById);
/**
 * @route   POST /api/clients
 * @desc    Create new client (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    CreateClientData
 */
router.post('/', clientController_1.ClientController.createClient);
/**
 * @route   PUT /api/clients/:id
 * @desc    Update client (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Client ID
 * @body    UpdateClientData
 */
router.put('/:id', clientController_1.ClientController.updateClient);
/**
 * @route   DELETE /api/clients/:id
 * @desc    Delete client (soft delete - tenant-aware)
 * @access  Private (admin only)
 * @param   id - Client ID
 */
router.delete('/:id', auth_1.requireAdmin, clientController_1.ClientController.deleteClient);
/**
 * @route   PATCH /api/clients/bulk/status
 * @desc    Bulk update client status (tenant-aware)
 * @access  Private (admin only)
 * @body    { clientIds: string[], isActive: boolean }
 */
router.patch('/bulk/status', auth_1.requireAdmin, clientController_1.ClientController.bulkUpdateClientStatus);
exports.default = router;
//# sourceMappingURL=clients.js.map