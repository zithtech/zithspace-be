import { Router } from "express";
import {
    createEscalationStatus,
    getAllEscalationStatuses,
    getEscalationStatusById,
    updateEscalationStatus,
    softDeleteEscalationStatus,
    deleteEscalationStatus,
} from "@/controllers/escalationStatusControllerV2";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ─── CRUD Routes ──────────────────────────────────────────────
router.post("/", requirePermission(Permissions.ESCALATION_MANAGE), createEscalationStatus);       // CREATE
router.get("/", requirePermission(Permissions.ESCALATION_READ), getAllEscalationStatuses);      // GET ALL
router.get("/:id", requirePermission(Permissions.ESCALATION_READ), getEscalationStatusById);      // GET ONE
router.put("/:id", requirePermission(Permissions.ESCALATION_MANAGE), updateEscalationStatus);       // UPDATE
router.patch("/:id/deactivate", requirePermission(Permissions.ESCALATION_MANAGE), softDeleteEscalationStatus);   // SOFT DELETE
router.delete("/:id", requirePermission(Permissions.ESCALATION_MANAGE), deleteEscalationStatus);       // HARD DELETE

export default router;