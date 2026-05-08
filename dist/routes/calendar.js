"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const calendarcontroller_1 = require("@/controllers/calendarcontroller");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
console.log("📅 Calendar router initialized");
// Helper: optional auth — tries to authenticate but never blocks the request
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return next();
    (0, tenantContext_1.resolveTenant)(req, res, () => {
        (0, auth_1.authenticateToken)(req, res, () => next());
    });
}
router.get("/test", (req, res) => {
    res.json({ success: true, message: "Calendar router reached" });
});
router.get("/:provider/status", optionalAuth, calendarcontroller_1.CalendarController.getStatus);
router.get("/providers", tenantContext_1.resolveTenant, auth_1.authenticateToken, auth_1.requireAuth, calendarcontroller_1.CalendarController.getProviders);
router.get("/:provider/connect", tenantContext_1.resolveTenant, auth_1.authenticateToken, auth_1.requireAuth, calendarcontroller_1.CalendarController.connect);
router.get("/:provider/callback", calendarcontroller_1.CalendarController.callback);
router.post("/:provider/disconnect", tenantContext_1.resolveTenant, auth_1.authenticateToken, auth_1.requireAuth, calendarcontroller_1.CalendarController.disconnect);
router.post("/events/check-overlap", tenantContext_1.resolveTenant, auth_1.authenticateToken, auth_1.requireAuth, calendarcontroller_1.CalendarController.checkOverlap);
router.get("/events", tenantContext_1.resolveTenant, auth_1.authenticateToken, auth_1.requireAuth, calendarcontroller_1.CalendarController.getEvents);
router.post("/events", tenantContext_1.resolveTenant, auth_1.authenticateToken, auth_1.requireAuth, calendarcontroller_1.CalendarController.createEvent);
router.put("/events/:id", tenantContext_1.resolveTenant, auth_1.authenticateToken, auth_1.requireAuth, calendarcontroller_1.CalendarController.updateEvent);
router.delete("/events/:id", tenantContext_1.resolveTenant, auth_1.authenticateToken, auth_1.requireAuth, calendarcontroller_1.CalendarController.deleteEvent);
router.post("/sync", tenantContext_1.resolveTenant, auth_1.authenticateToken, auth_1.requireAuth, calendarcontroller_1.CalendarController.syncEvents);
exports.default = router;
//# sourceMappingURL=calendar.js.map