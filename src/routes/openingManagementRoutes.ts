import { Router } from "express";
import { OpeningManagementController } from "@/controllers/openingManagementController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", OpeningManagementController.createOpening);
router.get("/", OpeningManagementController.getOpenings);
router.get("/:id", OpeningManagementController.getOpeningById);
router.put("/:id", OpeningManagementController.updateOpening);
router.delete("/:id", OpeningManagementController.deleteOpening);

export default router;
