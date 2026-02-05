import { Router } from "express";
import { EmployeeFieldController } from "@/controllers/employeeFieldController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * Employee Field Configs
 * /api/employee-fields
 */

// Get all fields for a company
router.get("/", EmployeeFieldController.getFields);

// Create field
router.post("/", EmployeeFieldController.createField);

// Update field
router.put("/:id", EmployeeFieldController.updateField);

// Toggle visibility
router.patch("/:id/visibility", EmployeeFieldController.toggleVisibility);

// Delete field
router.delete("/:id", EmployeeFieldController.deleteField);

export default router;
