import express from "express";
import { createEmploymentDetails } from "@/controllers/employeeEmployementDetailes";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = express.Router();

// ================= GLOBAL MIDDLEWARE =================
// Tenant context + Auth apply to all employment-details routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ================= EMPLOYMENT DETAILS ROUTES =================

// CREATE – Work detail + timeline + projects + additional details
// router.post("/", EmployeeEmploymentDetailsController.createEmploymentDetails);

// // GET – Employment details by employeeId
// router.get(
//   "/:employeeId",
//   EmployeeEmploymentDetailsController.getEmploymentDetailsByEmployee,
// );

// // UPDATE – Employment details (replace / update strategy)
// router.put(
//   "/:employeeId",
//   EmployeeEmploymentDetailsController.updateEmploymentDetails,
// );

// // DELETE – All employment-related records for employee
// router.delete(
//   "/:employeeId",
//   EmployeeEmploymentDetailsController.deleteEmploymentDetails,
// );

export default router;
