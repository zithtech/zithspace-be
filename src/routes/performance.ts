// import { Router } from "express";
// import { authenticateToken, requireAuth } from "@/middleware/auth";
// import { resolveTenant } from "@/middleware/tenantContext";
// import { PerformanceController } from "@/controllers/PerformanceController";

// const router = Router();

// // tenant middleware
// router.use(resolveTenant);

// // 🔐 auth middleware (important)
// router.use(authenticateToken);
// router.use(requireAuth);

// /**
//  * @route   GET /api/performance/employee/:employeeId/summary
//  * @desc    Last 30 days ticket and attendance stats.
//  * @access  Private
//  */
// router.get(
//   "/employee/:employeeId/summary",
//   PerformanceController.getEmployeeFullPerformance
// );

// /**
//  * @route   GET /api/performance/employee/:employeeId/daily-updates
//  * @desc    Last 30 days BOD/EOD stats for an employee.
//  * @access  Private
//  */
// router.get(
//   "/employee/:employeeId/daily-updates",
//   PerformanceController.getDailyUpdateStats
// );

// /**
//  * @route   GET /api/performance/employee/:employeeId/leaves
//  * @desc    Last 30 days leave stats for an employee.
//  * @access  Private
//  */
// router.get(
//   "/employee/:employeeId/leaves",
//   PerformanceController.getLeaveStats
// );


// export default router;
