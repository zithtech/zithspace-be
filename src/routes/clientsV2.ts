import { Router } from 'express';
import { ClientV2Controller } from '@/controllers/clientV2Controller';
import ClientPortalCredentialController from '@/controllers/clientPortalCredentialController';
import ClientCustomerLinkController from '@/controllers/clientCustomerLinkController';
import MomStaffController from '@/controllers/momStaffController';
import CrStaffController from '@/controllers/crStaffController';
import ApprovalsStaffController from '@/controllers/approvalsStaffController';
import EnvironmentsStaffController from '@/controllers/environmentsStaffController';
import TeamStaffController from '@/controllers/teamStaffController';
import ClientMilestoneController from '@/controllers/clientMilestoneController';
import ClientProjectReleaseController from '@/controllers/clientProjectReleaseController';
import ClientPortalModuleSettingsController from '@/controllers/clientPortalModuleSettingsController';
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
 * @route   DELETE /api/clients-v2/projects/:projectId
 * @desc    Delete a project and its client mapping
 */
router.delete('/projects/:projectId', requirePermission(Permissions.CLIENT_DELETE), ClientV2Controller.deleteProject);

/**
 * @route   PUT /api/clients-v2/:id
 * @desc    Update client v2 (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.put('/:id', requirePermission(Permissions.CLIENT_UPDATE), ClientV2Controller.updateClient);

/**
 * @route   DELETE /api/clients-v2/:id
 * @desc    Delete client v2 (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.delete('/:id', requirePermission(Permissions.CLIENT_DELETE), ClientV2Controller.deleteClient);

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

/**
 * @route   DELETE /api/clients-v2/contacts/:contactId
 * @desc    Delete a contact
 */
router.delete('/contacts/:contactId', requirePermission(Permissions.CLIENT_UPDATE), ClientV2Controller.deleteContact);

// ==============================================
// DOCUMENTS
// ==============================================

/**
 * @route   POST /api/clients-v2/:clientId/documents
 * @desc    Upload and add a document to a client
 */
router.post('/:clientId/documents', requirePermission(Permissions.CLIENT_UPDATE), ClientV2Controller.addDocument);

/**
 * @route   PATCH /api/clients-v2/:clientId/documents/:documentId
 * @desc    Update editable metadata (fileName, category, documentType)
 */
router.patch('/:clientId/documents/:documentId', requirePermission(Permissions.CLIENT_UPDATE), ClientV2Controller.updateDocument);

/**
 * @route   DELETE /api/clients-v2/:clientId/documents/:documentId
 * @desc    Delete a client document
 */
router.delete('/:clientId/documents/:documentId', requirePermission(Permissions.CLIENT_DELETE), ClientV2Controller.deleteDocument);

/**
 * @route   GET /api/clients-v2/:clientId/documents/:documentId/download
 * @desc    Download a client document
 */
router.get('/:clientId/documents/:documentId/download', requirePermission(Permissions.CLIENT_READ), ClientV2Controller.downloadDocument);


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
 * @route   GET /api/clients-v2/:clientId/projects/importable
 * @desc    List existing projects in the tenant that are NOT yet linked to
 *          this client. Powers the "Import projects" picker.
 */
router.get(
  '/:clientId/projects/importable',
  requirePermission(Permissions.CLIENT_READ),
  ClientV2Controller.getImportableProjects,
);

/**
 * @route   POST /api/clients-v2/:clientId/projects/import
 * @desc    Bulk-link existing projects to this client. body: { projectIds[] }
 */
router.post(
  '/:clientId/projects/import',
  requirePermission(Permissions.CLIENT_UPDATE),
  ClientV2Controller.importProjects,
);

/**
 * @route   POST /api/clients-v2/:clientId/projects
 * @desc    Create a new project and map it to a client
 */
router.post('/:clientId/projects', requirePermission(Permissions.CLIENT_UPDATE), ClientV2Controller.addProject);

// ==============================================
// CLIENT PORTAL CREDENTIALS
// Staff-side management of per-contact portal login accounts.
// ==============================================

router.get(
  '/:clientId/portal-users',
  requirePermission(Permissions.CLIENT_READ),
  ClientPortalCredentialController.list,
);

router.post(
  '/:clientId/portal-users',
  requirePermission(Permissions.CLIENT_MANAGE),
  ClientPortalCredentialController.create,
);

router.post(
  '/portal-users/:portalUserId/reset-password',
  requirePermission(Permissions.CLIENT_MANAGE),
  ClientPortalCredentialController.resetPassword,
);

router.patch(
  '/portal-users/:portalUserId/status',
  requirePermission(Permissions.CLIENT_MANAGE),
  ClientPortalCredentialController.updateStatus,
);

router.delete(
  '/portal-users/:portalUserId',
  requirePermission(Permissions.CLIENT_MANAGE),
  ClientPortalCredentialController.remove,
);

// ==============================================
// BILLING CUSTOMER LINKAGE (drives portal invoice visibility)
// ==============================================

router.get(
  '/:clientId/billing-customers',
  requirePermission(Permissions.CLIENT_READ),
  ClientCustomerLinkController.listLinked,
);

router.get(
  '/:clientId/billing-customers/available',
  requirePermission(Permissions.CLIENT_READ),
  ClientCustomerLinkController.listAvailable,
);

router.post(
  '/:clientId/billing-customers',
  requirePermission(Permissions.CLIENT_MANAGE),
  ClientCustomerLinkController.link,
);

router.delete(
  '/:clientId/billing-customers/:customerId',
  requirePermission(Permissions.CLIENT_MANAGE),
  ClientCustomerLinkController.unlink,
);

// ==============================================
// INVOICES (per-client portal view)
// ==============================================

router.get(
  '/:clientId/invoices',
  requirePermission(Permissions.CLIENT_READ),
  ClientV2Controller.getClientInvoices,
);

// ==============================================
// MINUTES OF MEETING (per-client)
// ==============================================

router.get(
  '/:clientId/moms',
  requirePermission(Permissions.CLIENT_READ),
  MomStaffController.listForClient,
);

router.post(
  '/:clientId/moms',
  requirePermission(Permissions.CLIENT_UPDATE),
  MomStaffController.create,
);

// ==============================================
// CHANGE REQUESTS (per-client)
// ==============================================

router.get(
  '/:clientId/change-requests',
  requirePermission(Permissions.CLIENT_READ),
  CrStaffController.listForClient,
);

router.post(
  '/:clientId/change-requests',
  requirePermission(Permissions.CLIENT_UPDATE),
  CrStaffController.create,
);

// ==============================================
// APPROVALS (per-client)
// ==============================================

router.get(
  '/:clientId/approvals',
  requirePermission(Permissions.CLIENT_READ),
  ApprovalsStaffController.listForClient,
);

router.post(
  '/:clientId/approvals',
  requirePermission(Permissions.CLIENT_UPDATE),
  ApprovalsStaffController.create,
);

// ==============================================
// ENVIRONMENTS (per-client)
// ==============================================

router.get(
  '/:clientId/environments',
  requirePermission(Permissions.CLIENT_READ),
  EnvironmentsStaffController.listForClient,
);

router.post(
  '/:clientId/environments',
  requirePermission(Permissions.CLIENT_UPDATE),
  EnvironmentsStaffController.create,
);

// ==============================================
// TEAM / RESOURCE VISIBILITY (per-client)
// ==============================================

router.get(
  '/:clientId/team',
  requirePermission(Permissions.CLIENT_READ),
  TeamStaffController.listForClient,
);

router.get(
  '/:clientId/team/staff-options',
  requirePermission(Permissions.CLIENT_READ),
  TeamStaffController.staffOptions,
);

router.post(
  '/:clientId/team',
  requirePermission(Permissions.CLIENT_UPDATE),
  TeamStaffController.create,
);

router.post(
  '/:clientId/team/reorder',
  requirePermission(Permissions.CLIENT_UPDATE),
  TeamStaffController.reorder,
);

// ==============================================
// MILESTONES / DELIVERY TRACKER (per-client)
// ==============================================

router.get(
  '/:clientId/milestones',
  requirePermission(Permissions.CLIENT_READ),
  ClientMilestoneController.list,
);

router.post(
  '/:clientId/milestones',
  requirePermission(Permissions.CLIENT_UPDATE),
  ClientMilestoneController.create,
);

// ==============================================
// RELEASES (per-client)
// ==============================================

router.get(
  '/:clientId/releases',
  requirePermission(Permissions.CLIENT_READ),
  ClientProjectReleaseController.list,
);

router.get(
  '/:clientId/releases/milestone-options',
  requirePermission(Permissions.CLIENT_READ),
  ClientProjectReleaseController.milestoneOptions,
);

router.post(
  '/:clientId/releases',
  requirePermission(Permissions.CLIENT_UPDATE),
  ClientProjectReleaseController.create,
);

// ==============================================
// PORTAL MODULE SETTINGS (per-client page visibility)
// Controls which pages the client sees in their portal.
// ==============================================

router.get(
  '/:clientId/portal-modules',
  requirePermission(Permissions.CLIENT_READ),
  ClientPortalModuleSettingsController.list,
);

router.put(
  '/:clientId/portal-modules',
  requirePermission(Permissions.CLIENT_MANAGE),
  ClientPortalModuleSettingsController.update,
);

export default router;
