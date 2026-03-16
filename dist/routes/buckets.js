"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bucketController_1 = require("@/controllers/bucketController");
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
/**
 * @route   GET /api/buckets
 * @desc    Get all buckets for a tenant/project (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId, includeShared
 */
router.get('/', (0, permission_1.requirePermission)(permissions_1.Permissions.PROJECT_READ), bucketController_1.BucketController.getBuckets);
/**
 * @route   GET /api/buckets/:id/tickets
 * @desc    Get paginated tickets in bucket (tenant-aware)
 * @access  Private (bucket owner or members)
 * @param   id - Bucket ID
 * @query   page, limit
 */
router.get('/:id/tickets', (0, permission_1.requirePermission)(permissions_1.Permissions.PROJECT_READ), bucketController_1.BucketController.getBucketTickets);
/**
 * @route   GET /api/buckets/:id
 * @desc    Get bucket by ID with detailed ticket information (tenant-aware)
 * @access  Private (bucket owner or members)
 * @param   id - Bucket ID
 */
router.get('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.PROJECT_READ), bucketController_1.BucketController.getBucketById);
/**
 * @route   POST /api/buckets
 * @desc    Create a new bucket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { name: string, description?: string, color?: string, projectId?: string, isShared?: boolean }
 */
router.post('/', (0, permission_1.requirePermission)(permissions_1.Permissions.PROJECT_CREATE), bucketController_1.BucketController.createBucket);
/**
 * @route   PUT /api/buckets/:id
 * @desc    Update bucket (tenant-aware)
 * @access  Private (bucket owner only)
 * @param   id - Bucket ID
 * @body    { name?: string, description?: string, color?: string, isShared?: boolean }
 */
router.put('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.PROJECT_UPDATE), bucketController_1.BucketController.updateBucket);
/**
 * @route   DELETE /api/buckets/:id
 * @desc    Delete bucket and unassign all tickets (tenant-aware)
 * @access  Private (bucket owner only)
 * @param   id - Bucket ID
 */
router.delete('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.PROJECT_DELETE), bucketController_1.BucketController.deleteBucket);
/**
 * @route   POST /api/buckets/:id/members
 * @desc    Add member to shared bucket (tenant-aware)
 * @access  Private (bucket owner only)
 * @param   id - Bucket ID
 * @body    { userId: string, role?: string }
 */
router.post('/:id/members', (0, permission_1.requirePermission)(permissions_1.Permissions.PROJECT_MANAGE), bucketController_1.BucketController.addBucketMember);
/**
 * @route   DELETE /api/buckets/:id/members/:memberId
 * @desc    Remove member from shared bucket (tenant-aware)
 * @access  Private (bucket owner only)
 * @param   id - Bucket ID
 * @param   memberId - Member ID
 */
router.delete('/:id/members/:memberId', (0, permission_1.requirePermission)(permissions_1.Permissions.PROJECT_MANAGE), bucketController_1.BucketController.removeBucketMember);
/**
 * @route   POST /api/buckets/:id/assign
 * @desc    Assign tickets to bucket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Bucket ID
 * @body    { ticketIds: string[] }
 */
router.post('/:id/assign', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_UPDATE), bucketController_1.BucketController.assignTicketsToBucket);
/**
 * @route   POST /api/buckets/:id/unassign
 * @desc    Unassign tickets from bucket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Bucket ID
 * @body    { ticketIds: string[] }
 */
router.post('/:id/unassign', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_UPDATE), bucketController_1.BucketController.unassignTicketsFromBucket);
exports.default = router;
//# sourceMappingURL=buckets.js.map