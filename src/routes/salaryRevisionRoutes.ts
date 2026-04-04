import { Router } from "express";
import { SalaryRevisionController } from "@/controllers/salaryRevisionController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/salary-revisions/current/:employeeId
 * @desc    Get current salary structure of an employee
 * @access  Private
 */
router.get("/current/:employeeId", requirePermission(Permissions.SALARY_READ), SalaryRevisionController.getCurrentSalary);

/**
 * @route   POST /api/salary-revisions
 * @desc    Create a new salary revision entry
 * @access  Private
 */
router.post("/", requirePermission(Permissions.SALARY_MANAGE), SalaryRevisionController.createSalaryRevision);

/**
 * @route   GET /api/salary-revisions
 * @desc    Get all salary revisions for the tenant
 * @access  Private
 */
router.get("/", requirePermission(Permissions.SALARY_READ), SalaryRevisionController.getAllRevisions);

export default router;
