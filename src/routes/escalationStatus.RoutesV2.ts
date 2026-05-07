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

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ─── CRUD Routes ──────────────────────────────────────────────
router.post("/", createEscalationStatus);       // CREATE
router.get("/", getAllEscalationStatuses);      // GET ALL
router.get("/:id", getEscalationStatusById);      // GET ONE
router.put("/:id", updateEscalationStatus);       // UPDATE
router.patch("/:id/deactivate", softDeleteEscalationStatus);   // SOFT DELETE
router.delete("/:id", deleteEscalationStatus);       // HARD DELETE

export default router;