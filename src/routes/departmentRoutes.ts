import { Router } from "express";
import { DepartmentController } from "@/controllers/departmentController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission, requireAnyPermission } from "@/middleware/permission";
import { requireSubscriptionFeature } from "@/modules/entitlements/entitlements.middleware";
import { Permissions } from "@/types/permissions";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", requirePermission(Permissions.ORG_DEPARTMENT_CREATE), requireSubscriptionFeature("admin_org_structure_department", { exact: false }), DepartmentController.createDepartment);
router.get("/", requireAnyPermission(Permissions.ORG_DEPARTMENT_READ, Permissions.LEAVE_POLICY_READ, Permissions.LEAVE_POLICY_CREATE, Permissions.LEAVE_MANAGE), DepartmentController.getAllDepartments);
router.get("/:id", requireAnyPermission(Permissions.ORG_DEPARTMENT_READ, Permissions.LEAVE_POLICY_READ, Permissions.LEAVE_POLICY_CREATE, Permissions.LEAVE_MANAGE), DepartmentController.getDepartmentById);
router.put("/:id", requirePermission(Permissions.ORG_DEPARTMENT_UPDATE), requireSubscriptionFeature("admin_org_structure_department", { exact: false }), DepartmentController.updateDepartment);
router.delete("/:id", requirePermission(Permissions.ORG_DEPARTMENT_DELETE), requireSubscriptionFeature("admin_org_structure_department", { exact: false }), DepartmentController.deleteDepartment);

export default router;
