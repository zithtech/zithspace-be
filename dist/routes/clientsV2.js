"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const clientV2Controller_1 = require("@/controllers/clientV2Controller");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
// ==============================================
// CORE CLIENT ROUTES
// ==============================================
/**
 * @route   GET /api/clients-v2
 * @desc    Get all clients with filtering, pagination, and search (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_READ), clientV2Controller_1.ClientV2Controller.getClients);
/**
 * @route   GET /api/clients-v2/projects/check
 * @desc    Live duplicate check for project name/code (tenant-aware)
 *          Must be registered before /:id so it isn't captured as a clientId.
 */
router.get('/projects/check', clientV2Controller_1.ClientV2Controller.checkProjectAvailability);
/**
 * @route   GET /api/clients-v2/projects/stats
 * @desc    Lightweight project counts (total, active) for dashboard cards.
 *          Must be registered before /:id.
 */
router.get('/projects/stats', clientV2Controller_1.ClientV2Controller.getProjectStats);
/**
 * @route   GET /api/clients-v2/:id
 * @desc    Get client v2 by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_READ), clientV2Controller_1.ClientV2Controller.getClientById);
/**
 * @route   POST /api/clients-v2
 * @desc    Create new client v2 (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.post('/', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_CREATE), clientV2Controller_1.ClientV2Controller.createClient);
/**
 * @route   PUT /api/clients-v2/projects/:projectId
 * @desc    Update an existing project and its client mapping
 */
router.put('/projects/:projectId', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_UPDATE), clientV2Controller_1.ClientV2Controller.updateProject);
/**
 * @route   PUT /api/clients-v2/:id
 * @desc    Update client v2 (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.put('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_UPDATE), clientV2Controller_1.ClientV2Controller.updateClient);
/**
 * @route   DELETE /api/clients-v2/:id
 * @desc    Delete client v2 (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.delete('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_DELETE), clientV2Controller_1.ClientV2Controller.deleteClient);
// ==============================================
// CONTACT ROUTES
// ==============================================
/**
 * @route   POST /api/clients-v2/:clientId/contacts
 * @desc    Add a contact to a client
 */
router.post('/:clientId/contacts', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_UPDATE), clientV2Controller_1.ClientV2Controller.addContact);
/**
 * @route   PUT /api/clients-v2/contacts/:contactId
 * @desc    Update a contact
 */
router.put('/contacts/:contactId', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_UPDATE), clientV2Controller_1.ClientV2Controller.updateContact);
// ==============================================
// DOCUMENTS
// ==============================================
/**
 * @route   POST /api/clients-v2/:clientId/documents
 * @desc    Upload and add a document to a client
 */
router.post('/:clientId/documents', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_UPDATE), clientV2Controller_1.ClientV2Controller.addDocument);
/**
 * @route   DELETE /api/clients-v2/:clientId/documents/:documentId
 * @desc    Delete a client document
 */
router.delete('/:clientId/documents/:documentId', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_DELETE), clientV2Controller_1.ClientV2Controller.deleteDocument);
// ==============================================
// ALLOCATION ROUTES
// ==============================================
/**
 * @route   GET /api/clients-v2/employees/select
 * @desc    Get all employees for selection dropdowns
 */
router.get('/employees/select', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_READ), clientV2Controller_1.ClientV2Controller.getEmployeesForSelect);
/**
 * @route   POST /api/clients-v2/:clientId/allocations
 * @desc    Add an employee allocation to a client
 */
router.post('/:clientId/allocations', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_UPDATE), clientV2Controller_1.ClientV2Controller.addAllocation);
/**
 * @route   PUT /api/clients-v2/allocations/:allocationId
 * @desc    Update an employee allocation
 */
router.put('/allocations/:allocationId', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_UPDATE), clientV2Controller_1.ClientV2Controller.updateAllocation);
// ==============================================
// CLIENT PROJECTS
// ==============================================
/**
 * @route   GET /api/clients-v2/:clientId/projects
 * @desc    Get all projects mapped to a client
 */
router.get('/:clientId/projects', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_READ), clientV2Controller_1.ClientV2Controller.getProjects);
/**
 * @route   POST /api/clients-v2/:clientId/projects
 * @desc    Create a new project and map it to a client
 */
router.post('/:clientId/projects', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_UPDATE), clientV2Controller_1.ClientV2Controller.addProject);
exports.default = router;
//# sourceMappingURL=clientsV2.js.map