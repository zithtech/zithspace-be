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

const router = Router();
// Apply auth middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ─── CRUD Routes ─────────────────────────────────────────────
router.post("/", createEscalationCategory);       // CREATE
router.get("/", getAllEscalationCategories);      // GET ALL
router.get("/:id", getEscalationCategoryById);       // GET ONE
router.put("/:id", updateEscalationCategory);        // UPDATE
router.patch("/:id/deactivate", softDeleteEscalationCategory); // SOFT DELETE
router.delete("/:id", deleteEscalationCategory);        // HARD DELETE

export default router;