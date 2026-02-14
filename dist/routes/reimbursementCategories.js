"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const reimbursementCategoryController_1 = require("@/controllers/reimbursementCategoryController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
// Configure Multer for file uploads
const uploadDir = 'uploads/';
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path_1.default.extname(file.originalname));
    }
});
const upload = (0, multer_1.default)({ storage: storage });
/**
 * @route   POST /api/reimbursement-categories/upload
 * @desc    Upload a file for reimbursement items
 * @access  Private
 */
router.post('/upload', upload.single('file'), reimbursementCategoryController_1.ReimbursementCategoryController.uploadFile);
// ==========================================
// REIMBURSEMENT REQUEST ROUTES
// ==========================================
/**
 * @route   GET /api/reimbursement-categories/requests
 * @desc    Get requests (My Requests, Manager Approvals, Finance View)
 * @query   view (manager, finance), status, page, limit
 */
router.get('/requests', reimbursementCategoryController_1.ReimbursementRequestController.getRequests);
/**
 * @route   GET /api/reimbursement-categories/requests/:id
 * @desc    Get request by ID
 */
router.get('/requests/:id', reimbursementCategoryController_1.ReimbursementRequestController.getRequestById);
/**
 * @route   POST /api/reimbursement-categories/requests
 * @desc    Create new reimbursement request
 */
router.post('/requests', reimbursementCategoryController_1.ReimbursementRequestController.createRequest);
/**
 * @route   PUT /api/reimbursement-categories/requests/:id
 * @desc    Update request (Edit)
 */
router.put('/requests/:id', reimbursementCategoryController_1.ReimbursementRequestController.updateRequest);
/**
 * @route   DELETE /api/reimbursement-categories/requests/:id
 * @desc    Delete request
 */
router.delete('/requests/:id', reimbursementCategoryController_1.ReimbursementRequestController.deleteRequest);
/**
 * @route   POST /api/reimbursement-categories/requests/:id/manager
 * @desc    Manager Action (Approve, Reject, Clarify)
 * @body    { action: 'APPROVE'|'REJECT'|'CLARIFY', comments }
 */
router.post('/requests/:id/manager', reimbursementCategoryController_1.ReimbursementRequestController.managerAction);
/**
 * @route   POST /api/reimbursement-categories/requests/:id/finance
 * @desc    Finance Action (Paid, Reject, On Hold)
 * @body    { action: 'PAID'|'REJECT'|'ON_HOLD', comments }
 */
router.post('/requests/:id/finance', reimbursementCategoryController_1.ReimbursementRequestController.financeAction);
// ==========================================
// REIMBURSEMENT ITEM ROUTES
// ==========================================
/**
 * @route   POST /api/reimbursement-categories/requests/:requestId/items
 * @desc    Add item to request
 */
router.post('/requests/:requestId/items', reimbursementCategoryController_1.ReimbursementItemController.addItem);
/**
 * @route   PUT /api/reimbursement-categories/requests/:requestId/items/:itemId
 * @desc    Update item
 */
router.put('/requests/:requestId/items/:itemId', reimbursementCategoryController_1.ReimbursementItemController.updateItem);
/**
 * @route   DELETE /api/reimbursement-categories/requests/:requestId/items/:itemId
 * @desc    Delete item
 */
router.delete('/requests/:requestId/items/:itemId', reimbursementCategoryController_1.ReimbursementItemController.deleteItem);
// ==========================================
// REIMBURSEMENT APPROVAL & ATTACHMENT ROUTES
// ==========================================
/**
 * @route   GET /api/reimbursement-categories/requests/:requestId/approvals
 * @desc    Get approval history
 */
router.get('/requests/:requestId/approvals', reimbursementCategoryController_1.ReimbursementApprovalController.getHistory);
/**
 * @route   GET /api/reimbursement-categories/requests/:requestId/attachments
 * @desc    Get attachments
 */
router.get('/requests/:requestId/attachments', reimbursementCategoryController_1.ReimbursementAttachmentController.getAttachments);
/**
 * @route   POST /api/reimbursement-categories/requests/:requestId/attachments
 * @desc    Add attachment to request
 */
router.post('/requests/:requestId/attachments', reimbursementCategoryController_1.ReimbursementAttachmentController.addAttachment);
/**
 * @route   DELETE /api/reimbursement-categories/requests/:requestId/attachments/:attachmentId
 * @desc    Delete attachment
 */
router.delete('/requests/:requestId/attachments/:attachmentId', reimbursementCategoryController_1.ReimbursementAttachmentController.deleteAttachment);
// ==========================================
// REIMBURSEMENT CATEGORY ROUTES
// ==========================================
/**
 * @route   GET /api/reimbursement-categories
 * @desc    Get all reimbursement categories (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, search, isActive, sortBy, sortOrder
 */
router.get('/', reimbursementCategoryController_1.ReimbursementCategoryController.getCategories);
/**
 * @route   POST /api/reimbursement-categories
 * @desc    Create new reimbursement category (tenant-aware)
 * @access  Private (Admin only)
 * @body    { name, maxPerRequest?, monthlyLimit?, yearlyLimit?, eligibleRoles?, approvalRoles?, accept?, attachmentRequired?, isActive? }
 */
router.post('/', reimbursementCategoryController_1.ReimbursementCategoryController.createCategory);
/**
 * @route   GET /api/reimbursement-categories/:id
 * @desc    Get category by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Category ID
 */
router.get('/:id', reimbursementCategoryController_1.ReimbursementCategoryController.getCategoryById);
/**
 * @route   PUT /api/reimbursement-categories/:id
 * @desc    Update reimbursement category (tenant-aware)
 * @access  Private (Admin only)
 * @param   id - Category ID
 * @body    Partial category data
 */
router.put('/:id', reimbursementCategoryController_1.ReimbursementCategoryController.updateCategory);
/**
 * @route   DELETE /api/reimbursement-categories/:id
 * @desc    Delete reimbursement category (tenant-aware)
 * @access  Private (Admin only)
 * @param   id - Category ID
 */
router.delete('/:id', reimbursementCategoryController_1.ReimbursementCategoryController.deleteCategory);
exports.default = router;
//# sourceMappingURL=reimbursementCategories.js.map