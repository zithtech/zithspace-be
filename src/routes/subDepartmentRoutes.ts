import express from "express";
import { SubDepartmentController } from "@/controllers/subDepartmentController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = express.Router();

// Apply authentication and tenant context middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", SubDepartmentController.createSubDepartment);
router.get("/", SubDepartmentController.getAllSubDepartments);
router.get("/:id", SubDepartmentController.getSubDepartmentById);
router.put("/:id", SubDepartmentController.updateSubDepartment);
router.delete("/:id", SubDepartmentController.deleteSubDepartment);

export default router;