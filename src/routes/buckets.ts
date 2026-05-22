import { Router } from 'express';
import { BucketController } from '@/controllers/bucketController';
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

/**
 * @route   GET /api/buckets
 * @desc    Get all buckets for a tenant/project (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId, includeShared
 */
router.get('/', requirePermission(Permissions.TICKET_BUCKET_READ), BucketController.getBuckets);

/**
 * @route   GET /api/buckets/:id/tickets
 * @desc    Get paginated tickets in bucket (tenant-aware)
 * @access  Private (bucket owner or members)
 * @param   id - Bucket ID
 * @query   page, limit
 */
router.get('/:id/tickets', requirePermission(Permissions.TICKET_BUCKET_READ), BucketController.getBucketTickets);

/**
 * @route   GET /api/buckets/:id
 * @desc    Get bucket by ID with detailed ticket information (tenant-aware)
 * @access  Private (bucket owner or members)
 * @param   id - Bucket ID
 */
router.get('/:id', requirePermission(Permissions.TICKET_BUCKET_READ), BucketController.getBucketById);

/**
 * @route   POST /api/buckets
 * @desc    Create a new bucket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { name: string, description?: string, color?: string, projectId?: string, isShared?: boolean }
 */
router.post('/', requirePermission(Permissions.TICKET_BUCKET_CREATE), BucketController.createBucket);

/**
 * @route   PUT /api/buckets/:id
 * @desc    Update bucket (tenant-aware)
 * @access  Private (bucket owner only)
 * @param   id - Bucket ID
 * @body    { name?: string, description?: string, color?: string, isShared?: boolean }
 */
router.put('/:id', requirePermission(Permissions.TICKET_BUCKET_UPDATE), BucketController.updateBucket);

/**
 * @route   DELETE /api/buckets/:id
 * @desc    Delete bucket and unassign all tickets (tenant-aware)
 * @access  Private (bucket owner only)
 * @param   id - Bucket ID
 */
router.delete('/:id', requirePermission(Permissions.TICKET_BUCKET_DELETE), BucketController.deleteBucket);

/**
 * @route   POST /api/buckets/:id/members
 * @desc    Add member to shared bucket (tenant-aware)
 * @access  Private (bucket owner only)
 * @param   id - Bucket ID
 * @body    { userId: string, role?: string }
 */
router.post('/:id/members', requirePermission(Permissions.TICKET_BUCKET_UPDATE), BucketController.addBucketMember);

/**
 * @route   DELETE /api/buckets/:id/members/:memberId
 * @desc    Remove member from shared bucket (tenant-aware)
 * @access  Private (bucket owner only)
 * @param   id - Bucket ID
 * @param   memberId - Member ID
 */
router.delete('/:id/members/:memberId', requirePermission(Permissions.TICKET_BUCKET_UPDATE), BucketController.removeBucketMember);

/**
 * @route   POST /api/buckets/:id/assign
 * @desc    Assign tickets to bucket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Bucket ID
 * @body    { ticketIds: string[] }
 */
router.post('/:id/assign', requirePermission(Permissions.TICKET_UPDATE), BucketController.assignTicketsToBucket);

/**
 * @route   POST /api/buckets/:id/unassign
 * @desc    Unassign tickets from bucket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Bucket ID
 * @body    { ticketIds: string[] }
 */
/**
 * @route   POST /api/buckets/:id/move-to-sprint
 * @desc    Move all tickets in bucket to specific sprint (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Bucket ID
 * @body    { sprintId: string }
 */
router.post('/:id/move-to-sprint', requirePermission(Permissions.TICKET_UPDATE), BucketController.moveBucketToSprint);

/**
 * @route   POST /api/buckets/:id/move-to-backlog
 * @desc    Move all tickets in bucket back to backlog (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Bucket ID
 */
router.post('/:id/move-to-backlog', requirePermission(Permissions.TICKET_UPDATE), BucketController.moveBucketToBacklog);

export default router;
