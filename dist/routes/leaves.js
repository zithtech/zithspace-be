"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const leaveController_1 = __importDefault(require("@/controllers/leaveController"));
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/**
 * @route   POST /api/leaves
 * @desc    Apply for leave
 * @access  Private (authenticated users)
 */
router.post("/", leaveController_1.default.applyLeave);
/**
 * @route   GET /api/leaves/my-leaves
 * @desc    Get current user's leaves
 * @access  Private (authenticated users)
 */
router.get("/my-leaves", leaveController_1.default.getMyLeaves);
/**
 * @route   GET /api/leaves/pending-approvals
 * @desc    Get pending leave approvals (for managers and super admins)
 * @access  Private (managers and super admins)
 */
router.get("/pending-approvals", leaveController_1.default.getPendingApprovals);
/**
 * @route   GET /api/leaves/:id
 * @desc    Get leave by ID
 * @access  Private (authenticated users - own leaves, managers - subordinates, admins - all)
 */
router.get("/:id", leaveController_1.default.getLeaveById);
/**
 * @route   GET /api/leaves
 * @desc    Get all leaves (admin only)
 * @access  Private (admin only)
 */
router.get("/", auth_1.requireAdmin, leaveController_1.default.getAllLeaves);
/**
 * @route   PUT /api/leaves/:id/approve
 * @desc    Approve leave (managers and super admins)
 * @access  Private (managers for subordinates, super admins for all)
 */
router.put("/:id/approve", leaveController_1.default.approveLeave);
/**
 * @route   PUT /api/leaves/:id/reject
 * @desc    Reject leave (managers and super admins)
 * @access  Private (managers for subordinates, super admins for all)
 */
router.put("/:id/reject", leaveController_1.default.rejectLeave);
/**
 * @route   PUT /api/leaves/:id/cancel
 * @desc    Cancel own leave
 * @access  Private (authenticated users - own leaves only)
 */
router.put("/:id/cancel", leaveController_1.default.cancelLeave);
exports.default = router;
//# sourceMappingURL=leaves.js.map