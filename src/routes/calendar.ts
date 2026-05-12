import { Router, Request, Response, NextFunction } from "express";
import { CalendarController } from "@/controllers/calendarcontroller";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";

const router = Router();
console.log("📅 Calendar router initialized");

// Helper: optional auth — tries to authenticate but never blocks the request
function optionalAuth(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return next();
    resolveTenant(req as any, res, () => {
        authenticateToken(req as any, res, () => next());
    });
}

router.get("/test", (req, res) => {
    res.json({ success: true, message: "Calendar router reached" });
});

router.get("/:provider/status", optionalAuth, requirePermission('calendar.read'), CalendarController.getStatus);
router.get("/providers", resolveTenant, authenticateToken, requireAuth, requirePermission('calendar.read'), CalendarController.getProviders);
router.get(
    "/:provider/connect",
    resolveTenant,
    authenticateToken,
    requireAuth,
    requirePermission('calendar.manage'),
    CalendarController.connect
);
router.get("/:provider/callback", CalendarController.callback);
router.post(
    "/:provider/disconnect",
    resolveTenant,
    authenticateToken,
    requireAuth,
    requirePermission('calendar.manage'),
    CalendarController.disconnect
);
router.post(
    "/events/check-overlap",
    resolveTenant,
    authenticateToken,
    requireAuth,
    requirePermission('calendar.create'),
    CalendarController.checkOverlap
);
router.get(
    "/events",
    resolveTenant,
    authenticateToken,
    requireAuth,
    requirePermission('calendar.read'),
    CalendarController.getEvents
);
router.post(
    "/events",
    resolveTenant,
    authenticateToken,
    requireAuth,
    requirePermission('calendar.create'),
    CalendarController.createEvent
);
router.put(
    "/events/:id",
    resolveTenant,
    authenticateToken,
    requireAuth,
    requirePermission('calendar.update'),
    CalendarController.updateEvent
);
router.delete(
    "/events/:id",
    resolveTenant,
    authenticateToken,
    requireAuth,
    requirePermission('calendar.delete'),
    CalendarController.deleteEvent
);
router.post(
    "/sync",
    resolveTenant,
    authenticateToken,
    requireAuth,
    requirePermission('calendar.read'),
    CalendarController.syncEvents
);

export default router;
