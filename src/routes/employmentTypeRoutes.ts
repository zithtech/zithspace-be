import { Router } from "express";
import { EmploymentTypeController } from "@/controllers/employmentTypeController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { requireSubscriptionFeature } from "@/modules/entitlements/entitlements.middleware";
import { Permissions } from "@/types/permissions";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", requirePermission(Permissions.ORG_EMPLOYMENT_TYPE_CREATE), requireSubscriptionFeature("admin_org_structure_employment_type", { exact: false }), EmploymentTypeController.createEmploymentType);
router.get("/", requirePermission(Permissions.ORG_EMPLOYMENT_TYPE_READ), EmploymentTypeController.getAllEmploymentTypes);
router.get("/:id", requirePermission(Permissions.ORG_EMPLOYMENT_TYPE_READ), EmploymentTypeController.getEmploymentTypeById);
router.put("/:id", requirePermission(Permissions.ORG_EMPLOYMENT_TYPE_UPDATE), requireSubscriptionFeature("admin_org_structure_employment_type", { exact: false }), EmploymentTypeController.updateEmploymentType);
router.delete("/:id", requirePermission(Permissions.ORG_EMPLOYMENT_TYPE_DELETE), requireSubscriptionFeature("admin_org_structure_employment_type", { exact: false }), EmploymentTypeController.deleteEmploymentType);

export default router;