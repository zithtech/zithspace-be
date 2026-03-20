"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reimbursementConfigController_1 = require("@/controllers/reimbursementConfigController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// Middleware: tenant resolution & authentication
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/* ================== REIMBURSEMENT CONFIG ROUTES ================== */
/**
 * @route   GET /api/reimbursements
 * @desc    Get all reimbursement configurations (with monthly/yearly calculation)
 * @access  Private
 */
router.get("/", reimbursementConfigController_1.ReimbursementConfigurationController.getConfigs);
/**
 * @route   GET /api/reimbursements/:id
 * @desc    Get single reimbursement configuration by ID
 * @access  Private
 */
router.get("/:id", reimbursementConfigController_1.ReimbursementConfigurationController.getConfigById);
/**
 * @route   POST /api/reimbursements
 * @desc    Create new reimbursement configuration
 * @access  Private (Admin recommended)
 */
router.post("/", 
// requireAdmin, // enable if only admin can create
reimbursementConfigController_1.ReimbursementConfigurationController.createConfig);
/**
 * @route   PUT /api/reimbursements/:id
 * @desc    Update reimbursement configuration
 * @access  Private (Admin recommended)
 */
router.put("/:id", 
// requireAdmin,
reimbursementConfigController_1.ReimbursementConfigurationController.updateConfig);
/**
 * @route   DELETE /api/reimbursements/:id
 * @desc    Delete reimbursement configuration
 * @access  Private (Admin recommended)
 */
router.delete("/:id", 
// requireAdmin,
reimbursementConfigController_1.ReimbursementConfigurationController.deleteConfig);
exports.default = router;
//# sourceMappingURL=reimbursementConfig.js.map