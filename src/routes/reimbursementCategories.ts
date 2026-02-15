import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { 
  ReimbursementCategoryController,
  ReimbursementRequestController,
  ReimbursementItemController,
  ReimbursementApprovalController,
  ReimbursementAttachmentController,
} from '@/controllers/reimbursementCategoryController';

import { authenticateToken, requireAuth, requireAdmin } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

// Configure Multer for file uploads
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

/**
 * @route   POST /api/reimbursement-categories/upload
 * @desc    Upload a file for reimbursement items
 * @access  Private
 */
router.post('/upload', upload.single('file'), ReimbursementCategoryController.uploadFile);

// ==========================================
// REIMBURSEMENT REQUEST ROUTES
// ==========================================

/**
 * @route   GET /api/reimbursement-categories/requests
 * @desc    Get requests (My Requests, Manager Approvals, Finance View)
 * @query   view (manager, finance), status, page, limit
 */
router.get('/requests', ReimbursementRequestController.getRequests);

/**
 * @route   GET /api/reimbursement-categories/requests/:id
 * @desc    Get request by ID
 */
router.get('/requests/:id', ReimbursementRequestController.getRequestById);

/**
 * @route   POST /api/reimbursement-categories/requests
 * @desc    Create new reimbursement request
 */
router.post('/requests', ReimbursementRequestController.createRequest);

/**
 * @route   PUT /api/reimbursement-categories/requests/:id
 * @desc    Update request (Edit)
 */
router.put('/requests/:id', ReimbursementRequestController.updateRequest);

/**
 * @route   DELETE /api/reimbursement-categories/requests/:id
 * @desc    Delete request
 */
router.delete('/requests/:id', ReimbursementRequestController.deleteRequest);

/**
 * @route   POST /api/reimbursement-categories/requests/:id/manager
 * @desc    Manager Action (Approve, Reject, Clarify)
 * @body    { action: 'APPROVE'|'REJECT'|'CLARIFY', comments }
 */
router.post('/requests/:id/manager', ReimbursementRequestController.managerAction);

/**
 * @route   POST /api/reimbursement-categories/requests/:id/finance
 * @desc    Finance Action (Paid, Reject, On Hold)
 * @body    { action: 'PAID'|'REJECT'|'ON_HOLD', comments }
 */
router.post('/requests/:id/finance', ReimbursementRequestController.financeAction);

// ==========================================
// REIMBURSEMENT ITEM ROUTES
// ==========================================

/**
 * @route   POST /api/reimbursement-categories/requests/:requestId/items
 * @desc    Add item to request
 */
router.post('/requests/:requestId/items', ReimbursementItemController.addItem);

/**
 * @route   PUT /api/reimbursement-categories/requests/:requestId/items/:itemId
 * @desc    Update item
 */
router.put('/requests/:requestId/items/:itemId', ReimbursementItemController.updateItem);

/**
 * @route   DELETE /api/reimbursement-categories/requests/:requestId/items/:itemId
 * @desc    Delete item
 */
router.delete('/requests/:requestId/items/:itemId', ReimbursementItemController.deleteItem);

// ==========================================
// REIMBURSEMENT APPROVAL & ATTACHMENT ROUTES
// ==========================================

/**
 * @route   GET /api/reimbursement-categories/requests/:requestId/approvals
 * @desc    Get approval history
 */
router.get('/requests/:requestId/approvals', ReimbursementApprovalController.getHistory);

/**
 * @route   GET /api/reimbursement-categories/requests/:requestId/attachments
 * @desc    Get attachments
 */
router.get('/requests/:requestId/attachments', ReimbursementAttachmentController.getAttachments);

/**
 * @route   POST /api/reimbursement-categories/requests/:requestId/attachments
 * @desc    Add attachment to request
 */
router.post('/requests/:requestId/attachments', ReimbursementAttachmentController.addAttachment);

/**
 * @route   DELETE /api/reimbursement-categories/requests/:requestId/attachments/:attachmentId
 * @desc    Delete attachment
 */
router.delete('/requests/:requestId/attachments/:attachmentId', ReimbursementAttachmentController.deleteAttachment);

// ==========================================
// REIMBURSEMENT CATEGORY ROUTES
// ==========================================

/**
 * @route   GET /api/reimbursement-categories
 * @desc    Get all reimbursement categories (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, search, isActive, sortBy, sortOrder
 */
router.get('/', ReimbursementCategoryController.getCategories);

/**
 * @route   POST /api/reimbursement-categories
 * @desc    Create new reimbursement category (tenant-aware)
 * @access  Private (Admin only)
 * @body    { name, maxPerRequest?, monthlyLimit?, yearlyLimit?, eligibleRoles?, approvalRoles?, accept?, attachmentRequired?, isActive? }
 */
router.post('/', ReimbursementCategoryController.createCategory);

/**
 * @route   GET /api/reimbursement-categories/:id
 * @desc    Get category by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Category ID
 */
router.get('/:id', ReimbursementCategoryController.getCategoryById);

/**
 * @route   PUT /api/reimbursement-categories/:id
 * @desc    Update reimbursement category (tenant-aware)
 * @access  Private (Admin only)
 * @param   id - Category ID
 * @body    Partial category data
 */
router.put('/:id',ReimbursementCategoryController.updateCategory);

/**
 * @route   DELETE /api/reimbursement-categories/:id
 * @desc    Delete reimbursement category (tenant-aware)
 * @access  Private (Admin only)
 * @param   id - Category ID
 */
router.delete('/:id', ReimbursementCategoryController.deleteCategory);

export default router;
