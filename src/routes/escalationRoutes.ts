import { Router } from "express";
import { EscalationController } from "../controllers/escalationController";
import { authenticateToken } from "../middleware/auth";
import { resolveTenant } from "../middleware/tenantContext";

const router = Router();

// All escalation routes are protected by tenant resolution and auth
router.use(resolveTenant);
router.use(authenticateToken);

// Base escalations CRUD
router.post("/", EscalationController.createEscalation);
router.get("/", EscalationController.getAllEscalations);
router.get("/:id", EscalationController.getEscalationById);
router.patch("/:id/status", EscalationController.updateEscalationStatus);
router.delete("/:id", EscalationController.deleteEscalation);

export default router;
