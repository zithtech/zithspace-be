import { Router } from "express";
import { EmploymentTypeController } from "@/controllers/employmentTypeController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", EmploymentTypeController.createEmploymentType);
router.get("/", EmploymentTypeController.getAllEmploymentTypes);
router.get("/:id", EmploymentTypeController.getEmploymentTypeById);
router.put("/:id", EmploymentTypeController.updateEmploymentType);
router.delete("/:id", EmploymentTypeController.deleteEmploymentType);

export default router;