// import { Router } from "express";
// import { authenticate } from "@/middleware/auth";
// import { requireTenant } from "@/middleware/tenantContext";
// import {
//   generatePayslips,
//   getPayslips,
//   getPayslipById,
//   getPayslipsByEmployee,
//   deletePayslip,
//   createPayslip,
// } from "@/controllers/PayslipController";

// const router = Router();

// // All routes require authentication and tenant context
// router.use(authenticate);
// router.use(requireTenant);

// /**
//  * POST /api/payslips/generate
//  * Generate payslips for selected users/department
//  */
// router.post("/generate", generatePayslips);

// /**
//  * POST /api/payslips
//  * Create a single payslip (from frontend modal)
//  */
// router.post("/", createPayslip);

// /**
//  * GET /api/payslips
//  * Get all payslips for the tenant
//  */
// router.get("/", getPayslips);

// /**
//  * GET /api/payslips/:id
//  * Get payslip by ID
//  */
// router.get("/:id", getPayslipById);

// /**
//  * GET /api/payslips/employee/:employeeId
//  * Get all payslips for a specific employee
//  */
// router.get("/employee/:employeeId", getPayslipsByEmployee);

// /**
//  * DELETE /api/payslips/:id
//  * Delete a payslip
//  */
// router.delete("/:id", deletePayslip);

// export default router;

import { Router } from "express";
import {
  generatePayslips,
  getPayslips,
  getPayslipById,
  getPayslipsByEmployee,
  createPayslip,
  deletePayslip,
} from "../controllers/PayslipController";

import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

// 🔥 SAME AS PROJECT ROUTER
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * POST /api/payslips/generate
 */
router.post("/generate", generatePayslips);

/**
 * GET /api/payslips
 */
router.get("/", getPayslips);

/**
 * GET /api/payslips/employee/:employeeId
 */
router.get("/employee/:employeeId", getPayslipsByEmployee);

/**
 * GET /api/payslips/:id
 */
router.get("/:id", getPayslipById);

/**
 * POST /api/payslips
 */
router.post("/", createPayslip);

/**
 * DELETE /api/payslips/:id
 */
router.delete("/:id", deletePayslip);

export default router;
