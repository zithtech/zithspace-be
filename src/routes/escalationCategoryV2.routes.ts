import { Router } from "express";
import {
    createEscalationCategory,
    getAllEscalationCategories,
    getEscalationCategoryById,
    updateEscalationCategory,
    softDeleteEscalationCategory,
    deleteEscalationCategory,
} from "@/controllers/escalationCategoryControllerV2";
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = Router();
// Apply auth middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ─── CRUD Routes ─────────────────────────────────────────────
router.post("/", requirePermission(Permissions.ESCALATION_MANAGE), createEscalationCategory);       // CREATE
router.get("/", requirePermission(Permissions.ESCALATION_READ), getAllEscalationCategories);      // GET ALL
router.get("/:id", requirePermission(Permissions.ESCALATION_READ), getEscalationCategoryById);       // GET ONE
router.put("/:id", requirePermission(Permissions.ESCALATION_MANAGE), updateEscalationCategory);        // UPDATE
router.patch("/:id/deactivate", requirePermission(Permissions.ESCALATION_MANAGE), softDeleteEscalationCategory); // SOFT DELETE
router.delete("/:id", requirePermission(Permissions.ESCALATION_MANAGE), deleteEscalationCategory);        // HARD DELETE

export default router;