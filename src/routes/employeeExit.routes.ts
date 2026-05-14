import express from "express";
import { EmployeeExitController } from "../controllers/employeeExit.controller";
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { resolveTenant } from '@/middleware/tenantContext';

const router = express.Router();

// Apply auth middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", requirePermission(Permissions.EXIT_CREATE), EmployeeExitController.createEmployeeExit);
router.get("/", requirePermission(Permissions.EXIT_READ), EmployeeExitController.getEmployeeExits);
router.get("/:id", requirePermission(Permissions.EXIT_READ), EmployeeExitController.getEmployeeExitById);
router.delete("/:id", requirePermission(Permissions.EXIT_MANAGE), EmployeeExitController.deleteEmployeeExit);

export default router;
