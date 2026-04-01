import { Router } from "express";
import { PayrollController } from "@/controllers/payrollController";
import { SalaryApprovalController } from "@/controllers/salaryApprovalController";
import { PayslipController } from "@/controllers/PayslipController";
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
 */
router.get("/leave-summary", PayrollController.getLeaveSummary);

/**
 * @route   POST /api/payroll/mark-as-paid
 */
router.post("/mark-as-paid", SalaryApprovalController.markAsPaid);

/**
 * @route   POST /api/payroll/payslip/generate
 */
router.post("/payslip/generate", PayslipController.generateManual);

/**
 * @route   POST /api/payroll/payslip/generate-bulk
 */
router.post("/payslip/generate-bulk", PayslipController.bulkGenerate);

/**
 * @route   GET /api/payroll/payslip/:payoutId
 */
router.get("/payslip/:payoutId", PayslipController.getPayslip);

/**
 * @route   GET /api/payroll/payslips/my
 */
router.get("/payslips/my", PayslipController.listMyPayslips);

/**
 * @route   GET /api/payroll/payslips/all
 */
router.get("/payslips/all", PayslipController.listAllPayslips);

/**
 * @route   DELETE /api/payroll/payslip/:id
 */
router.delete("/payslip/:id", PayslipController.deletePayslip);

/**
 * @route   GET /api/payroll/payslip/download/:id
 */
router.get("/payslip/download/:id", PayslipController.downloadPayslip);

/**
 * @route   POST /api/payroll/payslip/send-email
 */
router.post("/payslip/send-email", PayslipController.sendEmail);

/**
 * @route   POST /api/payroll/payslip/send-email-bulk
 */
router.post("/payslip/send-email-bulk", PayslipController.bulkSendEmail);

export default router;
