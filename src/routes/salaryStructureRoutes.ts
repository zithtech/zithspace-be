import { Router } from "express";
import { SalaryStructureController } from "@/controllers/salaryStructureController";
import { SalaryAssignmentController } from "@/controllers/salaryAssignmentController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * Salary Assignments
 */
router.get("/assignments", requirePermission(Permissions.SALARY_READ), SalaryAssignmentController.getAllAssignments);
router.get("/assignments/employee/:employeeId", requirePermission(Permissions.SALARY_READ), SalaryAssignmentController.getAssignmentByEmployee);
router.post("/assignments", requirePermission(Permissions.SALARY_MANAGE), SalaryAssignmentController.assignStructure);
router.put("/assignments/:id", requirePermission(Permissions.SALARY_MANAGE), SalaryAssignmentController.updateAssignment);
router.delete("/assignments/:id", requirePermission(Permissions.SALARY_MANAGE), SalaryAssignmentController.deleteAssignment);

/**
 * Salary Structures
 */
router.get("/", requirePermission(Permissions.SALARY_READ), SalaryStructureController.getSalaryStructures);
router.post("/calculate", requirePermission(Permissions.SALARY_READ), SalaryStructureController.calculatePreview);
router.get("/:id", requirePermission(Permissions.SALARY_READ), SalaryStructureController.getSalaryStructureById);
router.post("/", requirePermission(Permissions.SALARY_MANAGE), SalaryStructureController.createSalaryStructure);
router.put("/:id", requirePermission(Permissions.SALARY_MANAGE), SalaryStructureController.updateSalaryStructure);
router.patch("/:id/status", requirePermission(Permissions.SALARY_MANAGE), SalaryStructureController.updateSalaryStructureStatus);
router.delete("/:id", requirePermission(Permissions.SALARY_MANAGE), SalaryStructureController.deleteSalaryStructure);

export default router;
