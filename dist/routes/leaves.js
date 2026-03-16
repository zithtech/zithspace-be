"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const leaveController_1 = __importDefault(require("@/controllers/leaveController"));
const auth_1 = require("@/middleware/auth");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
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
router.post("/", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_CREATE), leaveController_1.default.applyLeave);
/**
 * @route   GET /api/leaves/my-leaves
 * @desc    Get current user's leaves
 * @access  Private (authenticated users)
 */
router.get("/my-leaves", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_READ), leaveController_1.default.getMyLeaves);
/**
 * @route   GET /api/leaves/pending-approvals
 * @desc    Get pending leave approvals (for managers and super admins)
 * @access  Private (managers and super admins)
 */
router.get("/pending-approvals", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_APPROVE), leaveController_1.default.getPendingApprovals);
/**
 * @route   GET /api/leaves/:id
 * @desc    Get leave by ID
 * @access  Private (authenticated users - own leaves, managers - subordinates, admins - all)
 */
router.get("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_READ), leaveController_1.default.getLeaveById);
/**
 * @route   GET /api/leaves
 * @desc    Get all leaves (admin only)
 * @access  Private (admin only)
 */
router.get("/", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_MANAGE), leaveController_1.default.getAllLeaves);
/**
 * @route   PUT /api/leaves/:id/approve
 * @desc    Approve leave (managers and super admins)
 * @access  Private (managers for subordinates, super admins for all)
 */
router.put("/:id/approve", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_APPROVE), leaveController_1.default.approveLeave);
/**
 * @route   PUT /api/leaves/:id/reject
 * @desc    Reject leave (managers and super admins)
 * @access  Private (managers for subordinates, super admins for all)
 */
router.put("/:id/reject", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_APPROVE), leaveController_1.default.rejectLeave);
/**
 * @route   PUT /api/leaves/:id/cancel
 * @desc    Cancel own leave
 * @access  Private (authenticated users - own leaves only)
 */
router.put("/:id/cancel", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_UPDATE), leaveController_1.default.cancelLeave);
exports.default = router;
//# sourceMappingURL=leaves.js.map