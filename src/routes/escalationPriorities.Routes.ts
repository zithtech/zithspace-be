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

const router = Router();

// Apply auth middleware to all routes

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ─── CRUD Routes ──────────────────────────────────────────────
router.post("/", createEscalationPriority);      // CREATE
router.get("/", getAllEscalationPriorities);     // GET ALL
router.get("/:id", getEscalationPriorityById);     // GET ONE
router.put("/:id", updateEscalationPriority);      // UPDATE
router.patch("/:id/deactivate", softDeleteEscalationPriority);  // SOFT DELETE
router.delete("/:id", deleteEscalationPriority);      // HARD DELETE

export default router;