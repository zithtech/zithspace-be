import { Router } from 'express';
import { ClientV2Controller } from '@/controllers/clientV2Controller';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

// ==============================================
// CORE CLIENT ROUTES
// ==============================================

/**
 * @route   GET /api/clients-v2
 * @desc    Get all clients with filtering, pagination, and search (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/', requirePermission(Permissions.CLIENT_READ), ClientV2Controller.getClients);

/**
 * @route   GET /api/clients-v2/projects/check
 * @desc    Live duplicate check for project name/code (tenant-aware)
 *          Must be registered before /:id so it isn't captured as a clientId.
 */
router.get('/projects/check', ClientV2Controller.checkProjectAvailability);

/**
 * @route   GET /api/clients-v2/projects/stats
 * @desc    Lightweight project counts (total, active) for dashboard cards.
 *          Must be registered before /:id.
 */
router.get('/projects/stats', ClientV2Controller.getProjectStats);

/**
 * @route   GET /api/clients-v2/:id
 * @desc    Get client v2 by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/:id', requirePermission(Permissions.CLIENT_READ), ClientV2Controller.getClientById);

/**
 * @route   POST /api/clients-v2
 * @desc    Create new client v2 (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.post('/', requirePermission(Permissions.CLIENT_CREATE), ClientV2Controller.createClient);

/**
 * @route   PUT /api/clients-v2/projects/:projectId
 * @desc    Update an existing project and its client mapping
 */
router.put('/projects/:projectId', requirePermission(Permissions.CLIENT_UPDATE), ClientV2Controller.updateProject);

/**
 * @route   PUT /api/clients-v2/:id
 * @desc    Update client v2 (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.put('/:id', requirePermission(Permissions.CLIENT_UPDATE), ClientV2Controller.updateClient);

// ==============================================
// CONTACT ROUTES
// ==============================================

/**
 * @route   POST /api/clients-v2/:clientId/contacts
 * @desc    Add a contact to a client
 */
router.post('/:clientId/contacts', requirePermission(Permissions.CLIENT_UPDATE), ClientV2Controller.addContact);

/**
 * @route   PUT /api/clients-v2/contacts/:contactId
 * @desc    Update a contact
 */
router.put('/contacts/:contactId', requirePermission(Permissions.CLIENT_UPDATE), ClientV2Controller.updateContact);

// ==============================================
// DOCUMENTS
// ==============================================

/**
 * @route   POST /api/clients-v2/:clientId/documents
 * @desc    Upload and add a document to a client
 */
router.post('/:clientId/documents', requirePermission(Permissions.CLIENT_UPDATE), ClientV2Controller.addDocument);

/**
 * @route   DELETE /api/clients-v2/:clientId/documents/:documentId
 * @desc    Delete a client document
 */
router.delete('/:clientId/documents/:documentId', requirePermission(Permissions.CLIENT_DELETE), ClientV2Controller.deleteDocument);


// ==============================================
// ALLOCATION ROUTES
// ==============================================

/**
 * @route   GET /api/clients-v2/employees/select
 * @desc    Get all employees for selection dropdowns
 */
router.get('/employees/select', requirePermission(Permissions.CLIENT_READ), ClientV2Controller.getEmployeesForSelect);

/**
 * @route   POST /api/clients-v2/:clientId/allocations
 * @desc    Add an employee allocation to a client
 */
router.post('/:clientId/allocations', requirePermission(Permissions.CLIENT_UPDATE), ClientV2Controller.addAllocation);

/**
 * @route   PUT /api/clients-v2/allocations/:allocationId
 * @desc    Update an employee allocation
 */
router.put('/allocations/:allocationId', requirePermission(Permissions.CLIENT_UPDATE), ClientV2Controller.updateAllocation);


// ==============================================
// CLIENT PROJECTS
// ==============================================

/**
 * @route   GET /api/clients-v2/:clientId/projects
 * @desc    Get all projects mapped to a client
 */
router.get('/:clientId/projects', requirePermission(Permissions.CLIENT_READ), ClientV2Controller.getProjects);

/**
 * @route   POST /api/clients-v2/:clientId/projects
 * @desc    Create a new project and map it to a client
 */
router.post('/:clientId/projects', requirePermission(Permissions.CLIENT_UPDATE), ClientV2Controller.addProject);

export default router;
