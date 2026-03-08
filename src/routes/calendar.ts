import { Router, Request, Response, NextFunction } from "express";
import { CalendarController } from "@/controllers/calendarcontroller";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

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

router.get("/:provider/status", optionalAuth, CalendarController.getStatus);
router.get("/providers", resolveTenant, authenticateToken, requireAuth, CalendarController.getProviders);
router.get(
    "/:provider/connect",
    resolveTenant,
    authenticateToken,
    requireAuth,
    CalendarController.connect
);
router.get("/:provider/callback", CalendarController.callback);
router.post(
    "/:provider/disconnect",
    resolveTenant,
    authenticateToken,
    requireAuth,
    CalendarController.disconnect
);
router.get(
    "/events",
    resolveTenant,
    authenticateToken,
    requireAuth,
    CalendarController.getEvents
);
router.post(
    "/events",
    resolveTenant,
    authenticateToken,
    requireAuth,
    CalendarController.createEvent
);
router.put(
    "/events/:id",
    resolveTenant,
    authenticateToken,
    requireAuth,
    CalendarController.updateEvent
);
router.delete(
    "/events/:id",
    resolveTenant,
    authenticateToken,
    requireAuth,
    CalendarController.deleteEvent
);
router.post(
    "/sync",
    resolveTenant,
    authenticateToken,
    requireAuth,
    CalendarController.syncEvents
);

export default router;
