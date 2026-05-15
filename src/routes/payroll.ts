import { Router } from "express";
import { PayrollController } from "@/controllers/payrollController";
import { SalaryApprovalController } from "@/controllers/salaryApprovalController";
import { PayslipController } from "@/controllers/PayslipController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/payroll/leave-summary
 */
router.get("/leave-summary", requirePermission(Permissions.PAYROLL_READ), PayrollController.getLeaveSummary);

/**
 * @route   POST /api/payroll/mark-as-paid
 */
router.post("/mark-as-paid", requirePermission(Permissions.PAYROLL_PAY), SalaryApprovalController.markAsPaid);

/**
 * @route   POST /api/payroll/payslip/generate
 */
router.post("/payslip/generate", requirePermission(Permissions.PAYROLL_PAYSLIP_CREATE), PayslipController.generateManual);

/**
 * @route   POST /api/payroll/payslip/generate-bulk
 */
router.post("/payslip/generate-bulk", requirePermission(Permissions.PAYROLL_PAYSLIP_CREATE), PayslipController.bulkGenerate);

/**
 * @route   GET /api/payroll/payslip/:payoutId
 */
router.get("/payslip/:payoutId", requirePermission(Permissions.PAYROLL_PAYSLIP_READ), PayslipController.getPayslip);

/**
 * @route   GET /api/payroll/payslips/my
 */
router.get("/payslips/my", requirePermission(Permissions.PAYROLL_READ), PayslipController.listMyPayslips);

/**
 * @route   GET /api/payroll/payslips/all
 */
router.get("/payslips/all", requirePermission(Permissions.PAYROLL_PAYSLIP_READ), PayslipController.listAllPayslips);

/**
 * @route   DELETE /api/payroll/payslip/:id
 */
router.delete("/payslip/:id", requirePermission(Permissions.PAYROLL_PAYSLIP_DELETE), PayslipController.deletePayslip);

/**
 * @route   GET /api/payroll/payslip/download/:id
 */
router.get("/payslip/download/:id", requirePermission(Permissions.PAYROLL_PAYSLIP_READ), PayslipController.downloadPayslip);

/**
 * @route   POST /api/payroll/payslip/send-email
 */
router.post("/payslip/send-email", requirePermission(Permissions.PAYROLL_PAYSLIP_SEND), PayslipController.sendEmail);

/**
 * @route   POST /api/payroll/payslip/send-email-bulk
 */
router.post("/payslip/send-email-bulk", requirePermission(Permissions.PAYROLL_PAYSLIP_SEND), PayslipController.bulkSendEmail);

export default router;
