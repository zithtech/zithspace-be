import express from "express";
import { EmployeeExitController } from "../controllers/employeeExit.controller";
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = express.Router();

// Apply auth middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", EmployeeExitController.createEmployeeExit);
router.get("/", EmployeeExitController.getEmployeeExits);
router.get("/:id", EmployeeExitController.getEmployeeExitById);
router.delete("/:id", EmployeeExitController.deleteEmployeeExit);

export default router;
