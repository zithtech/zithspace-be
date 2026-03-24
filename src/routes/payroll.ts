import { Router } from "express";
import { PayrollController } from "@/controllers/payrollController";
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

export default router;
