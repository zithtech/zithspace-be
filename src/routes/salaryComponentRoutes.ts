import { Router } from "express";
import { SalaryComponentController } from "@/controllers/salaryComponentController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * Salary Components
 */
router.get("/", SalaryComponentController.getSalaryComponents);
router.get("/:id", SalaryComponentController.getSalaryComponentById);
router.post("/", SalaryComponentController.createSalaryComponent);
router.put("/:id", SalaryComponentController.updateSalaryComponent);
router.patch(
  "/:id/status",
  SalaryComponentController.updateSalaryStatus
);
router.delete(
  "/:id",
  SalaryComponentController.deleteSalaryComponent
);


export default router;
