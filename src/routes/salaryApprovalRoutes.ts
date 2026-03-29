import { Router } from "express";
import { SalaryApprovalController } from "@/controllers/salaryApprovalController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ✅ 1. WORKFLOW CONFIGURATION
router.post("/workflows", requirePermission(Permissions.SETTINGS_MANAGE), SalaryApprovalController.upsertWorkflow);
router.get("/workflows", requirePermission(Permissions.SETTINGS_READ), SalaryApprovalController.getWorkflows);
router.delete("/workflows/:id", requirePermission(Permissions.SETTINGS_MANAGE), SalaryApprovalController.deleteWorkflow);

// ✅ 2. SUBMISSION
router.post("/submit", requirePermission(Permissions.SALARY_MANAGE), SalaryApprovalController.submitForApproval);

// ✅ 3. APPROVAL FLOW
router.post("/process-step", requirePermission(Permissions.SALARY_APPROVE), SalaryApprovalController.processStep);
router.get("/pending", requirePermission(Permissions.SALARY_READ), SalaryApprovalController.getPendingApprovals);

// ✅ 4. LEGACY / UTILITY
router.get("/", requirePermission(Permissions.SALARY_READ), SalaryApprovalController.getPayouts);
router.post("/bulk", requirePermission(Permissions.SALARY_MANAGE), SalaryApprovalController.bulkApprove);
router.get("/payouts", requirePermission(Permissions.SALARY_READ), SalaryApprovalController.getApprovedPayouts);
router.get("/export-excel", requirePermission(Permissions.SALARY_READ), SalaryApprovalController.exportToBankExcel);
router.post("/send-to-bank", requirePermission(Permissions.SALARY_MANAGE), SalaryApprovalController.sendToBankEmail);

// New Bank File Persistent Flow
router.post("/bank-file/generate", requirePermission(Permissions.SALARY_MANAGE), SalaryApprovalController.generateBankFile);
router.get("/bank-file/latest", requirePermission(Permissions.SALARY_READ), SalaryApprovalController.getLatestBankFile);
router.post("/bank-file/send", requirePermission(Permissions.SALARY_MANAGE), SalaryApprovalController.sendBankFileEmail);

export default router;
