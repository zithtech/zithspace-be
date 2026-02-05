import { Router } from "express";
import { PayslipFieldController } from "@/controllers/payslipFieldController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// Payslip Fields
router.get("/", PayslipFieldController.getFields);
router.get("/:id", PayslipFieldController.getFieldById);
router.post("/", PayslipFieldController.createField);
router.put("/:id", PayslipFieldController.updateField);
router.patch("/:id/status", PayslipFieldController.toggleStatus);
router.delete("/:id", PayslipFieldController.deleteField);

export default router;
