"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const calendarcontroller_1 = require("@/controllers/calendarcontroller");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// Helper: optional auth — tries to authenticate but never blocks the request
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return next();
    (0, tenantContext_1.resolveTenant)(req, res, () => {
        (0, auth_1.authenticateToken)(req, res, () => next());
    });
}
/**
 * @route   GET /api/zoho/status
 * @desc    Get Zoho connection status for the current user
 * @access  Public (returns connected: false if no auth)
 */
router.get("/status", optionalAuth, calendarcontroller_1.CalendarController.getStatus);
/**
 * @route   GET /api/zoho/connect
 * @desc    Get Zoho OAuth2 authorization URL
 * @access  Private
 */
router.get("/connect", tenantContext_1.resolveTenant, auth_1.authenticateToken, auth_1.requireAuth, calendarcontroller_1.CalendarController.connect);
/**
 * @route   GET /api/zoho/callback
 * @desc    Zoho OAuth2 callback — exchanges code for tokens
 * @access  Public (called by Zoho redirect)
 */
router.get("/callback", calendarcontroller_1.CalendarController.callback);
/**
 * @route   POST /api/zoho/disconnect
 * @desc    Disconnect Zoho account (clears tokens)
 * @access  Private
 */
router.post("/disconnect", tenantContext_1.resolveTenant, auth_1.authenticateToken, auth_1.requireAuth, calendarcontroller_1.CalendarController.disconnect);
/**
 * @route   GET /api/zoho/events
 * @desc    Get events from Zoho Calendar (syncs to DB)
 * @access  Private
 * @query   startDate, endDate (ISO strings)
 */
router.get("/events", tenantContext_1.resolveTenant, auth_1.authenticateToken, auth_1.requireAuth, calendarcontroller_1.CalendarController.getEvents);
/**
 * @route   POST /api/zoho/events
 * @desc    Create a new event on Zoho Calendar
 * @access  Private
 * @body    { title, description?, startTime, endTime, location? }
 */
router.post("/events", tenantContext_1.resolveTenant, auth_1.authenticateToken, auth_1.requireAuth, calendarcontroller_1.CalendarController.createEvent);
/**
 * @route   PUT /api/zoho/events/:id
 * @desc    Update an existing event on Zoho Calendar
 * @access  Private
 * @param   id - DB record id
 */
router.put("/events/:id", tenantContext_1.resolveTenant, auth_1.authenticateToken, auth_1.requireAuth, calendarcontroller_1.CalendarController.updateEvent);
/**
 * @route   DELETE /api/zoho/events/:id
 * @desc    Delete an event from Zoho Calendar
 * @access  Private
 * @param   id - DB record id
 */
router.delete("/events/:id", tenantContext_1.resolveTenant, auth_1.authenticateToken, auth_1.requireAuth, calendarcontroller_1.CalendarController.deleteEvent);
/**
 * @route   POST /api/zoho/sync
 * @desc    Full sync: fetch all upcoming events from Zoho and upsert to DB
 * @access  Private
 */
router.post("/sync", tenantContext_1.resolveTenant, auth_1.authenticateToken, auth_1.requireAuth, calendarcontroller_1.CalendarController.syncEvents);
exports.default = router;
//# sourceMappingURL=calendar.js.map