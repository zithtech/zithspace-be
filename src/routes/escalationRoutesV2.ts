import { Router } from "express";
import { authenticateToken, requireAuth } from "@/middleware/auth";
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


router.post("/", createEscalation);
router.get("/", getAllEscalations);
router.get("/:id", getEscalationById);
router.put("/:id", updateEscalation);
router.delete("/:id", deleteEscalation);

export default router;
