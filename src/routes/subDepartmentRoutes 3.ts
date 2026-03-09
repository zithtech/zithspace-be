import express from "express";
import { SubDepartmentController } from "@/controllers/subDepartmentController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = express.Router();

// Apply authentication and tenant context middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", requirePermission(Permissions.ORG_MANAGE), SubDepartmentController.createSubDepartment);
router.get("/", requirePermission(Permissions.ORG_READ), SubDepartmentController.getAllSubDepartments);
router.get("/:id", requirePermission(Permissions.ORG_READ), SubDepartmentController.getSubDepartmentById);
router.put("/:id", requirePermission(Permissions.ORG_MANAGE), SubDepartmentController.updateSubDepartment);
router.delete("/:id", requirePermission(Permissions.ORG_MANAGE), SubDepartmentController.deleteSubDepartment);

export default router;