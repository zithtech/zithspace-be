import { Router } from "express";
import { SalaryComponentController } from "@/controllers/salaryComponentController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * Salary Components
 */
router.get("/", requirePermission(Permissions.SALARY_READ), SalaryComponentController.getSalaryComponents);
router.get("/:id", requirePermission(Permissions.SALARY_READ), SalaryComponentController.getSalaryComponentById);
router.post("/", requirePermission(Permissions.SALARY_MANAGE), SalaryComponentController.createSalaryComponent);
router.put("/:id", requirePermission(Permissions.SALARY_MANAGE), SalaryComponentController.updateSalaryComponent);
router.patch(
  "/:id/status",
  requirePermission(Permissions.SALARY_MANAGE),
  SalaryComponentController.updateSalaryStatus
);
router.delete(
  "/:id",
  requirePermission(Permissions.SALARY_MANAGE),
  SalaryComponentController.deleteSalaryComponent
);


export default router;
