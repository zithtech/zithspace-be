import { Router } from "express";
import { DepartmentController } from "@/controllers/departmentController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", DepartmentController.createDepartment);
router.get("/", DepartmentController.getAllDepartments);
router.get("/:id", DepartmentController.getDepartmentById);
router.put("/:id", DepartmentController.updateDepartment);
router.delete("/:id", DepartmentController.deleteDepartment);

export default router;
