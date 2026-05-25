"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const clientV2Controller_1 = require("@/controllers/clientV2Controller");
const clientPortalCredentialController_1 = __importDefault(require("@/controllers/clientPortalCredentialController"));
const clientCustomerLinkController_1 = __importDefault(require("@/controllers/clientCustomerLinkController"));
const momStaffController_1 = __importDefault(require("@/controllers/momStaffController"));
const crStaffController_1 = __importDefault(require("@/controllers/crStaffController"));
const approvalsStaffController_1 = __importDefault(require("@/controllers/approvalsStaffController"));
const environmentsStaffController_1 = __importDefault(require("@/controllers/environmentsStaffController"));
const teamStaffController_1 = __importDefault(require("@/controllers/teamStaffController"));
const clientMilestoneController_1 = __importDefault(require("@/controllers/clientMilestoneController"));
const clientProjectReleaseController_1 = __importDefault(require("@/controllers/clientProjectReleaseController"));
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
 * @route   DELETE /api/clients-v2/projects/:projectId
 * @desc    Delete a project and its client mapping
 */
router.delete('/projects/:projectId', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_DELETE), clientV2Controller_1.ClientV2Controller.deleteProject);
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
 * @route   PATCH /api/clients-v2/:clientId/documents/:documentId
 * @desc    Update editable metadata (fileName, category, documentType)
 */
router.patch('/:clientId/documents/:documentId', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_UPDATE), clientV2Controller_1.ClientV2Controller.updateDocument);
/**
 * @route   DELETE /api/clients-v2/:clientId/documents/:documentId
 * @desc    Delete a client document
 */
router.delete('/:clientId/documents/:documentId', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_DELETE), clientV2Controller_1.ClientV2Controller.deleteDocument);
/**
 * @route   GET /api/clients-v2/:clientId/documents/:documentId/download
 * @desc    Download a client document
 */
router.get('/:clientId/documents/:documentId/download', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_READ), clientV2Controller_1.ClientV2Controller.downloadDocument);
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
 * @route   GET /api/clients-v2/:clientId/projects/importable
 * @desc    List existing projects in the tenant that are NOT yet linked to
 *          this client. Powers the "Import projects" picker.
 */
router.get('/:clientId/projects/importable', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_READ), clientV2Controller_1.ClientV2Controller.getImportableProjects);
/**
 * @route   POST /api/clients-v2/:clientId/projects/import
 * @desc    Bulk-link existing projects to this client. body: { projectIds[] }
 */
router.post('/:clientId/projects/import', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_UPDATE), clientV2Controller_1.ClientV2Controller.importProjects);
/**
 * @route   POST /api/clients-v2/:clientId/projects
 * @desc    Create a new project and map it to a client
 */
router.post('/:clientId/projects', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_UPDATE), clientV2Controller_1.ClientV2Controller.addProject);
// ==============================================
// CLIENT PORTAL CREDENTIALS
// Staff-side management of per-contact portal login accounts.
// ==============================================
router.get('/:clientId/portal-users', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_READ), clientPortalCredentialController_1.default.list);
router.post('/:clientId/portal-users', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_MANAGE), clientPortalCredentialController_1.default.create);
router.post('/portal-users/:portalUserId/reset-password', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_MANAGE), clientPortalCredentialController_1.default.resetPassword);
router.patch('/portal-users/:portalUserId/status', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_MANAGE), clientPortalCredentialController_1.default.updateStatus);
router.delete('/portal-users/:portalUserId', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_MANAGE), clientPortalCredentialController_1.default.remove);
// ==============================================
// BILLING CUSTOMER LINKAGE (drives portal invoice visibility)
// ==============================================
router.get('/:clientId/billing-customers', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_READ), clientCustomerLinkController_1.default.listLinked);
router.get('/:clientId/billing-customers/available', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_READ), clientCustomerLinkController_1.default.listAvailable);
router.post('/:clientId/billing-customers', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_MANAGE), clientCustomerLinkController_1.default.link);
router.delete('/:clientId/billing-customers/:customerId', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_MANAGE), clientCustomerLinkController_1.default.unlink);
// ==============================================
// INVOICES (per-client portal view)
// ==============================================
router.get('/:clientId/invoices', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_READ), clientV2Controller_1.ClientV2Controller.getClientInvoices);
// ==============================================
// MINUTES OF MEETING (per-client)
// ==============================================
router.get('/:clientId/moms', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_READ), momStaffController_1.default.listForClient);
router.post('/:clientId/moms', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_UPDATE), momStaffController_1.default.create);
// ==============================================
// CHANGE REQUESTS (per-client)
// ==============================================
router.get('/:clientId/change-requests', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_READ), crStaffController_1.default.listForClient);
router.post('/:clientId/change-requests', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_UPDATE), crStaffController_1.default.create);
// ==============================================
// APPROVALS (per-client)
// ==============================================
router.get('/:clientId/approvals', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_READ), approvalsStaffController_1.default.listForClient);
router.post('/:clientId/approvals', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_UPDATE), approvalsStaffController_1.default.create);
// ==============================================
// ENVIRONMENTS (per-client)
// ==============================================
router.get('/:clientId/environments', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_READ), environmentsStaffController_1.default.listForClient);
router.post('/:clientId/environments', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_UPDATE), environmentsStaffController_1.default.create);
// ==============================================
// TEAM / RESOURCE VISIBILITY (per-client)
// ==============================================
router.get('/:clientId/team', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_READ), teamStaffController_1.default.listForClient);
router.get('/:clientId/team/staff-options', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_READ), teamStaffController_1.default.staffOptions);
router.post('/:clientId/team', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_UPDATE), teamStaffController_1.default.create);
router.post('/:clientId/team/reorder', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_UPDATE), teamStaffController_1.default.reorder);
// ==============================================
// MILESTONES / DELIVERY TRACKER (per-client)
// ==============================================
router.get('/:clientId/milestones', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_READ), clientMilestoneController_1.default.list);
router.post('/:clientId/milestones', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_UPDATE), clientMilestoneController_1.default.create);
// ==============================================
// RELEASES (per-client)
// ==============================================
router.get('/:clientId/releases', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_READ), clientProjectReleaseController_1.default.list);
router.get('/:clientId/releases/milestone-options', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_READ), clientProjectReleaseController_1.default.milestoneOptions);
router.post('/:clientId/releases', (0, permission_1.requirePermission)(permissions_1.Permissions.CLIENT_UPDATE), clientProjectReleaseController_1.default.create);
exports.default = router;
//# sourceMappingURL=clientsV2.js.map