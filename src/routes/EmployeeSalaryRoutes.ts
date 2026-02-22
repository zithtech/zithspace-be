import { Router } from "express";
import {
  authenticateToken,
  requireAuth,
  requireAdmin,
} from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { EmployeeSalaryController } from "@/controllers/employeeSalaryController";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * Salary Routes
 */

router.get("/dashboard", EmployeeSalaryController.getSalaryDashboard);
router.get("/", EmployeeSalaryController.getSalaries);
router.post("/", EmployeeSalaryController.addSalary);
router.put("/:id", EmployeeSalaryController.updateSalary);
router.delete("/:id", EmployeeSalaryController.deleteSalary);

export default router;
