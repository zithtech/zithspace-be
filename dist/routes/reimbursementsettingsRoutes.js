"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reimbursementsettingsController_1 = __importDefault(require("@/controllers/reimbursementsettingsController"));
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// Middleware: tenant resolution & authentication
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/* ================== REIMBURSEMENT SETTINGS CATEGORY ROUTES ================== */
/**
 * @route   GET /api/reimbursement-settings-categories
 * @desc    Get all reimbursement categories
 * @access  Private
 */
router.get("/", reimbursementsettingsController_1.default.getCategories);
/**
 * @route   GET /api/reimbursement-settings-categories/:id
 * @desc    Get single reimbursement category by ID
 * @access  Private
 */
router.get("/:id", reimbursementsettingsController_1.default.getCategoryById);
/**
 * @route   POST /api/reimbursement-settings-categories
 * @desc    Create new reimbursement category
 * @access  Private (Admin recommended)
 */
router.post("/", 
// requireAdmin, // enable if needed
reimbursementsettingsController_1.default.createCategory);
/**
 * @route   PUT /api/reimbursement-settings-categories/:id
 * @desc    Update reimbursement category
 * @access  Private (Admin recommended)
 */
router.put("/:id", 
// requireAdmin,
reimbursementsettingsController_1.default.updateCategory);
/**
 * @route   DELETE /api/reimbursement-settings-categories/:id
 * @desc    Delete reimbursement category
 * @access  Private (Admin recommended)
 */
router.delete("/:id", 
// requireAdmin,
reimbursementsettingsController_1.default.deleteCategory);
exports.default = router;
//# sourceMappingURL=reimbursementsettingsRoutes.js.map