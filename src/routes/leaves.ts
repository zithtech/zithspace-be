import { Router } from "express";
import LeaveController from "@/controllers/leaveController";
import {
  authenticateToken,
  requireAuth,
} from "@/middleware/auth";
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   POST /api/leaves
 * @desc    Apply for leave
 * @access  Private (authenticated users)
 */
router.post("/", requirePermission(Permissions.LEAVE_CREATE), LeaveController.applyLeave);

/**
 * @route   GET /api/leaves/my-leaves
 * @desc    Get current user's leaves
 * @access  Private (authenticated users)
 */
router.get("/my-leaves", requirePermission(Permissions.LEAVE_READ), LeaveController.getMyLeaves);

/**
 * @route   GET /api/leaves/pending-approvals
 * @desc    Get pending leave approvals (for managers and super admins)
 * @access  Private (managers and super admins)
 */
router.get("/pending-approvals", requirePermission(Permissions.LEAVE_APPROVE), LeaveController.getPendingApprovals);

/**
 * @route   GET /api/leaves/:id
 * @desc    Get leave by ID
 * @access  Private (authenticated users - own leaves, managers - subordinates, admins - all)
 */
router.get("/:id", requirePermission(Permissions.LEAVE_READ), LeaveController.getLeaveById);

/**
 * @route   GET /api/leaves
 * @desc    Get all leaves (admin only)
 * @access  Private (admin only)
 */
router.get("/", requirePermission(Permissions.LEAVE_MANAGE), LeaveController.getAllLeaves);

/**
 * @route   PUT /api/leaves/:id/approve
 * @desc    Approve leave (managers and super admins)
 * @access  Private (managers for subordinates, super admins for all)
 */
router.put("/:id/approve", requirePermission(Permissions.LEAVE_APPROVE), LeaveController.approveLeave);

/**
 * @route   PUT /api/leaves/:id/reject
 * @desc    Reject leave (managers and super admins)
 * @access  Private (managers for subordinates, super admins for all)
 */
router.put("/:id/reject", requirePermission(Permissions.LEAVE_APPROVE), LeaveController.rejectLeave);

/**
 * @route   PUT /api/leaves/:id/cancel
 * @desc    Cancel own leave
 * @access  Private (authenticated users - own leaves only)
 */
router.put("/:id/cancel", requirePermission(Permissions.LEAVE_UPDATE), LeaveController.cancelLeave);

export default router;
