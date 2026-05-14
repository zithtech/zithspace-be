import { Router } from "express";
import { DepartmentController } from "@/controllers/departmentController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", requirePermission(Permissions.ORG_DEPARTMENT_CREATE), DepartmentController.createDepartment);
router.get("/", requirePermission(Permissions.ORG_DEPARTMENT_READ), DepartmentController.getAllDepartments);
router.get("/:id", requirePermission(Permissions.ORG_DEPARTMENT_READ), DepartmentController.getDepartmentById);
router.put("/:id", requirePermission(Permissions.ORG_DEPARTMENT_UPDATE), DepartmentController.updateDepartment);
router.delete("/:id", requirePermission(Permissions.ORG_DEPARTMENT_DELETE), DepartmentController.deleteDepartment);

export default router;
