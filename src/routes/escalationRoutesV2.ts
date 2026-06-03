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
    deleteEscalation,
    getTrashEscalations,
    restoreEscalation,
    permanentDeleteEscalation,
    emptyTrash,
    bulkRestoreEscalations,
    bulkPermanentDeleteEscalations
} from "../controllers/escalationControllerV2";

const router = Router();
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// Trash routes
router.get("/trash", requirePermission(Permissions.ESCALATION_READ), getTrashEscalations);
router.delete("/trash/empty", requirePermission(Permissions.ESCALATION_DELETE), emptyTrash);
router.post("/trash/bulk-restore", requirePermission(Permissions.ESCALATION_UPDATE), bulkRestoreEscalations);
router.post("/trash/bulk-permanent-delete", requirePermission(Permissions.ESCALATION_DELETE), bulkPermanentDeleteEscalations);
router.post("/:id/restore", requirePermission(Permissions.ESCALATION_UPDATE), restoreEscalation);
router.delete("/:id/permanent", requirePermission(Permissions.ESCALATION_DELETE), permanentDeleteEscalation);

// Standard V2 CRUD
router.post("/", requirePermission(Permissions.ESCALATION_CREATE), createEscalation);
router.get("/", requirePermission(Permissions.ESCALATION_READ), getAllEscalations);
router.get("/:id", requirePermission(Permissions.ESCALATION_READ), getEscalationById);
router.put("/:id", requirePermission(Permissions.ESCALATION_UPDATE), updateEscalation);
router.delete("/:id", requirePermission(Permissions.ESCALATION_DELETE), deleteEscalation);

export default router;
