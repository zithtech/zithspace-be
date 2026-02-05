import { Router } from "express";
import { SalaryStructureController } from "@/controllers/SalaryStructureController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * Salary Structures
 */
router.get("/", SalaryStructureController.getSalaryStructures);
router.get("/:id", SalaryStructureController.getSalaryStructureById);
router.post("/", SalaryStructureController.createSalaryStructure);
router.put("/:id", SalaryStructureController.updateSalaryStructure);
router.patch("/:id/toggle-active", SalaryStructureController.toggleActive);
router.delete("/:id", SalaryStructureController.deleteSalaryStructure);

export default router;
