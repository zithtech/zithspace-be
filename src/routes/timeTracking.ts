import { Router } from "express";
import { TimeTrackingController } from "@/controllers/timeTrackingController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.get("/", TimeTrackingController.getEntries);
router.post("/start", TimeTrackingController.startTimer);
router.post("/:id/pause", TimeTrackingController.pauseTimer);
router.post("/:id/resume", TimeTrackingController.resumeTimer);
router.post("/:id/stop", TimeTrackingController.stopTimer);
router.put("/:id", TimeTrackingController.updateEntry);
router.delete("/:id", TimeTrackingController.deleteEntry);

export default router;
