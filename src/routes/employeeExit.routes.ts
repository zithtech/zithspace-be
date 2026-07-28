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
router.get("/my-requests", requirePermission(Permissions.EXIT_READ), EmployeeExitController.getMyExitRequests);
router.get("/pending-approvals", requirePermission(Permissions.EXIT_READ), EmployeeExitController.getPendingApprovals);
router.get("/clearances", requirePermission(Permissions.EXIT_READ), EmployeeExitController.getClearances);
router.get("/", requirePermission(Permissions.EXIT_READ), EmployeeExitController.getEmployeeExits);
// Checklist Config Routes
router.get("/config/checklist", requirePermission(Permissions.EXIT_READ), EmployeeExitController.getChecklistConfigs);
router.post("/config/checklist", requirePermission(Permissions.EXIT_MANAGE), EmployeeExitController.addChecklistConfig);
router.delete("/config/checklist/:id", requirePermission(Permissions.EXIT_MANAGE), EmployeeExitController.deleteChecklistConfig);

router.get("/:id", requirePermission(Permissions.EXIT_READ), EmployeeExitController.getEmployeeExitById);
router.get("/:id/clearances", requirePermission(Permissions.EXIT_READ), EmployeeExitController.getClearancesByRequestId);
router.put("/:id", requirePermission(Permissions.EXIT_MANAGE), EmployeeExitController.updateEmployeeExit);
router.put("/:id/status", requirePermission(Permissions.EXIT_MANAGE), EmployeeExitController.updateEmployeeExitStatus);
router.put("/:id/clearance", requirePermission(Permissions.EXIT_MANAGE), EmployeeExitController.updateClearanceStatus);
router.post("/:id/fnf/calculate", requirePermission(Permissions.EXIT_MANAGE), EmployeeExitController.calculateFnF);
router.put("/:id/fnf", requirePermission(Permissions.EXIT_MANAGE), EmployeeExitController.processFnFSettlement);
router.delete("/:id", requirePermission(Permissions.EXIT_MANAGE), EmployeeExitController.deleteEmployeeExit);

router.get("/:id/interview", requirePermission(Permissions.EXIT_READ), EmployeeExitController.getInterview);
router.post("/:id/interview", requirePermission(Permissions.EXIT_MANAGE), EmployeeExitController.submitInterview);

export default router;
