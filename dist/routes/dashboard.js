"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboardController_1 = require("@/controllers/dashboardController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
/**
 * Dashboard Routes
 * All routes require authentication and tenant context
 */
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/**
 * @route   GET /api/dashboard/summary
 * @desc    Get comprehensive dashboard summary with all metrics
 * @access  Private (Authenticated users)
 */
router.get("/summary", dashboardController_1.DashboardController.getDashboardSummary);
exports.default = router;
//# sourceMappingURL=dashboard.js.map