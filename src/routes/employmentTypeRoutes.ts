import { Router } from "express";
import { EmploymentTypeController } from "@/controllers/employmentTypeController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", requirePermission(Permissions.ORG_MANAGE), EmploymentTypeController.createEmploymentType);
router.get("/", requirePermission(Permissions.ORG_READ), EmploymentTypeController.getAllEmploymentTypes);
router.get("/:id", requirePermission(Permissions.ORG_READ), EmploymentTypeController.getEmploymentTypeById);
router.put("/:id", requirePermission(Permissions.ORG_MANAGE), EmploymentTypeController.updateEmploymentType);
router.delete("/:id", requirePermission(Permissions.ORG_MANAGE), EmploymentTypeController.deleteEmploymentType);

export default router;