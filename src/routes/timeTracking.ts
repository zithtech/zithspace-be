import { Router } from "express";
import { TimeTrackingController } from "@/controllers/timeTrackingController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission, requireAnyPermission } from "@/middleware/permission";
import { requireSubscriptionFeature } from "@/modules/entitlements/entitlements.middleware";
import { Permissions } from "@/types/permissions";

console.log("🚀 Time Tracking Routes Loading...");
const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// Base time-tracking feature check
router.use(requireSubscriptionFeature("work_time_tracking"));

router.get("/", requireAnyPermission(Permissions.TIME_TRACKING_READ, Permissions.TIME_TRACKING_TEAM_READ), TimeTrackingController.getEntries);
router.get("/performance", requirePermission(Permissions.TIME_TRACKING_TEAM_READ), requireSubscriptionFeature("work_time_tracking_team", { exact: true }), TimeTrackingController.getPerformance);
router.post("/start", requirePermission(Permissions.TIME_TRACKING_CREATE), TimeTrackingController.startTimer);
router.post("/manual", requirePermission(Permissions.TIME_TRACKING_CREATE), TimeTrackingController.createManualEntry);
router.post("/:id/pause", requirePermission(Permissions.TIME_TRACKING_CREATE), TimeTrackingController.pauseTimer);
router.post("/:id/resume", requirePermission(Permissions.TIME_TRACKING_CREATE), TimeTrackingController.resumeTimer);
router.post("/:id/stop", requirePermission(Permissions.TIME_TRACKING_CREATE), TimeTrackingController.stopTimer);
router.put("/:id", requirePermission(Permissions.TIME_TRACKING_CREATE), TimeTrackingController.updateEntry);
router.delete("/:id", requirePermission(Permissions.TIME_TRACKING_DELETE), TimeTrackingController.deleteEntry);

export default router;
