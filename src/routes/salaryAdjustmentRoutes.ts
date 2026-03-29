import { Router } from "express";
import { SalaryAdjustmentController } from "@/controllers/salaryAdjustmentController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ✅ Create/Update Adjustment
router.post("/", requirePermission(Permissions.SALARY_MANAGE), SalaryAdjustmentController.upsertAdjustment);

// ✅ Get Adjustments
router.get("/", requirePermission(Permissions.SALARY_READ), SalaryAdjustmentController.getAdjustments);

// ✅ Delete Adjustment
router.delete("/:id", requirePermission(Permissions.SALARY_MANAGE), SalaryAdjustmentController.deleteAdjustment);

// ✅ Bulk Adjustment
router.post("/bulk", requirePermission(Permissions.SALARY_MANAGE), SalaryAdjustmentController.bulkAdjustment);

export default router;
