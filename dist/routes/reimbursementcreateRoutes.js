"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reimbursementcreateController_1 = require("@/controllers/reimbursementcreateController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const multer_1 = __importDefault(require("multer"));
// Setup multer for file uploads (temp storage)
const upload = (0, multer_1.default)({ dest: "uploads/" });
const router = (0, express_1.Router)();
// Middleware: tenant resolution & authentication
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/* ================== REIMBURSEMENT ROUTES ================== */
/**
 * @route   POST /api/reimbursements
 * @desc    Create new reimbursement (with file uploads)
 * @access  Private
 */
router.post("/", upload.array("files"), // Expect multiple files with field name "files"
// requireAdmin, // Enable if only admin can create
reimbursementcreateController_1.ReimbursementController.create);
// Add this temporarily to your router
/**
 * @route   GET /api/reimbursements
 * @desc    Get all reimbursements
 * @access  Private
 */
router.get("/", reimbursementcreateController_1.ReimbursementController.getAll);
/**
 * @route   GET /api/reimbursements/:id
 * @desc    Get reimbursement by ID
 * @access  Private
 */
router.get("/:id", reimbursementcreateController_1.ReimbursementController.getById);
/**
 * @route   PUT /api/reimbursements/:id
 * @desc    Update reimbursement status
 * @access  Private
 */
router.put("/:id", reimbursementcreateController_1.ReimbursementController.update);
/**
 * @route   DELETE /api/reimbursements/:id
 * @desc    Delete reimbursement
 * @access  Private
 */
router.delete("/:id", reimbursementcreateController_1.ReimbursementController.delete);
exports.default = router;
//# sourceMappingURL=reimbursementcreateRoutes.js.map