import { Router } from "express";
import { DashboardController } from "@/controllers/dashboardController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

/**
 * Dashboard Routes
 * All routes require authentication and tenant context
 */

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/dashboard/summary
 * @desc    Get comprehensive dashboard summary with all metrics
 * @access  Private (Authenticated users)
 */
router.get("/summary", DashboardController.getDashboardSummary);

export default router;
