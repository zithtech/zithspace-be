import { Router } from "express";
import * as reasonForExitController from "../controllers/reasonForExit.controller";
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// Apply auth middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", reasonForExitController.createReasonForExit);
router.get("/", reasonForExitController.getReasonForExits);
router.get("/:id", reasonForExitController.getReasonForExitById);
router.put("/:id", reasonForExitController.updateReasonForExit);
router.delete("/:id", reasonForExitController.deleteReasonForExit);

export default router;


