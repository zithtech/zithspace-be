import { Router } from "express";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";
import { resolveTenant } from "@/middleware/tenantContext";
import { requireSubscriptionFeature } from "@/modules/entitlements/entitlements.middleware";
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
router.get("/trash", requirePermission(Permissions.ESCALATION_READ), requireSubscriptionFeature("work_escalations_escalation_trash", { exact: false }), getTrashEscalations);
router.delete("/trash/empty", requirePermission(Permissions.ESCALATION_DELETE), requireSubscriptionFeature("work_escalations_escalation_trash", { exact: false }), emptyTrash);
router.post("/trash/bulk-restore", requirePermission(Permissions.ESCALATION_UPDATE), requireSubscriptionFeature("work_escalations_escalation_trash", { exact: false }), bulkRestoreEscalations);
router.post("/trash/bulk-permanent-delete", requirePermission(Permissions.ESCALATION_DELETE), requireSubscriptionFeature("work_escalations_escalation_trash", { exact: false }), bulkPermanentDeleteEscalations);
router.post("/:id/restore", requirePermission(Permissions.ESCALATION_UPDATE), requireSubscriptionFeature("work_escalations_escalation_trash", { exact: false }), restoreEscalation);
router.delete("/:id/permanent", requirePermission(Permissions.ESCALATION_DELETE), requireSubscriptionFeature("work_escalations_escalation_trash", { exact: false }), permanentDeleteEscalation);

// Standard V2 CRUD
router.post("/", requirePermission(Permissions.ESCALATION_CREATE), requireSubscriptionFeature("work_escalations_escalation_list", { exact: false }), createEscalation);
router.get("/", requirePermission(Permissions.ESCALATION_READ), requireSubscriptionFeature("work_escalations_escalation_list", { exact: false }), getAllEscalations);
router.get("/:id", requirePermission(Permissions.ESCALATION_READ), requireSubscriptionFeature("work_escalations_escalation_list", { exact: false }), getEscalationById);
router.put("/:id", requirePermission(Permissions.ESCALATION_UPDATE), requireSubscriptionFeature("work_escalations_escalation_list", { exact: false }), updateEscalation);
router.delete("/:id", requirePermission(Permissions.ESCALATION_DELETE), requireSubscriptionFeature("work_escalations_escalation_list", { exact: false }), deleteEscalation);

export default router;
