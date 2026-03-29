import { Router } from "express";
import { PayrollController } from "@/controllers/payrollController";
import { SalaryApprovalController } from "@/controllers/salaryApprovalController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/payroll/leave-summary
 * @desc    Get leave summary for an employee for a specific month
 * @access  Private (authenticated users within tenant)
 */
router.get("/leave-summary", PayrollController.getLeaveSummary);

/**
 * @route   POST /api/payroll/mark-as-paid
 * @desc    Mark all SENT_TO_BANK payouts as PAID for a month/year
 * @access  Private (authenticated users within tenant)
 */
router.post("/mark-as-paid", SalaryApprovalController.markAsPaid);

export default router;
