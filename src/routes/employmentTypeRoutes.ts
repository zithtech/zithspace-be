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

router.post("/", requirePermission(Permissions.ORG_EMPLOYMENT_TYPE_CREATE), EmploymentTypeController.createEmploymentType);
router.get("/", requirePermission(Permissions.ORG_EMPLOYMENT_TYPE_READ), EmploymentTypeController.getAllEmploymentTypes);
router.get("/:id", requirePermission(Permissions.ORG_EMPLOYMENT_TYPE_READ), EmploymentTypeController.getEmploymentTypeById);
router.put("/:id", requirePermission(Permissions.ORG_EMPLOYMENT_TYPE_UPDATE), EmploymentTypeController.updateEmploymentType);
router.delete("/:id", requirePermission(Permissions.ORG_EMPLOYMENT_TYPE_DELETE), EmploymentTypeController.deleteEmploymentType);

export default router;