import { Router } from "express";
import {
    createEscalationPriority,
    getAllEscalationPriorities,
    getEscalationPriorityById,
    updateEscalationPriority,
    softDeleteEscalationPriority,
    deleteEscalationPriority,
} from "@/controllers/escalationPrioritiesV2Controller";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = Router();

// Apply auth middleware to all routes

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ─── CRUD Routes ──────────────────────────────────────────────
router.post("/", requirePermission(Permissions.ESCALATION_MANAGE), createEscalationPriority);      // CREATE
router.get("/", requirePermission(Permissions.ESCALATION_READ), getAllEscalationPriorities);     // GET ALL
router.get("/:id", requirePermission(Permissions.ESCALATION_READ), getEscalationPriorityById);     // GET ONE
router.put("/:id", requirePermission(Permissions.ESCALATION_MANAGE), updateEscalationPriority);      // UPDATE
router.patch("/:id/deactivate", requirePermission(Permissions.ESCALATION_MANAGE), softDeleteEscalationPriority);  // SOFT DELETE
router.delete("/:id", requirePermission(Permissions.ESCALATION_MANAGE), deleteEscalationPriority);      // HARD DELETE

export default router;