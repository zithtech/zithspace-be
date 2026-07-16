import { Router } from "express";
import { DashboardController } from "@/controllers/dashboardController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requireSubscriptionFeature } from "@/modules/subscriptions";

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
router.use(requireSubscriptionFeature('page.dashboard'));

/**
 * @route   GET /api/dashboard/summary
 * @desc    Get comprehensive dashboard summary with all metrics
 * @access  Private (Authenticated users)
 */
router.get("/summary", DashboardController.getDashboardSummary);

/**
 * @route   GET /api/dashboard/settings
 * @desc    Get dashboard settings (tenant-aware)
 * @access  Private (Authenticated users)
 */
router.get("/settings", DashboardController.getSettings);

/**
 * @route   PUT /api/dashboard/settings
 * @desc    Update dashboard settings (tenant-aware)
 * @access  Private (Authenticated users)
 */
router.put("/settings", DashboardController.updateSettings);

export default router;
