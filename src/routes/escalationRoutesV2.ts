import { Router } from "express";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";
import { resolveTenant } from "@/middleware/tenantContext";
import {
    createEscalation,
    getAllEscalations,
    getEscalationById,
    updateEscalation,
    deleteEscalation
} from "../controllers/escalationControllerV2";

const router = Router();
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);


router.post("/", requirePermission(Permissions.ESCALATION_CREATE), createEscalation);
router.get("/", requirePermission(Permissions.ESCALATION_READ), getAllEscalations);
router.get("/:id", requirePermission(Permissions.ESCALATION_READ), getEscalationById);
router.put("/:id", requirePermission(Permissions.ESCALATION_UPDATE), updateEscalation);
router.delete("/:id", requirePermission(Permissions.ESCALATION_DELETE), deleteEscalation);

export default router;
