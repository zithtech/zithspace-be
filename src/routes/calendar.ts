import { Router, Request, Response, NextFunction } from "express";
import { CalendarController } from "@/controllers/calendarcontroller";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

// Helper: optional auth — tries to authenticate but never blocks the request
function optionalAuth(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return next();
    resolveTenant(req as any, res, () => {
        authenticateToken(req as any, res, () => next());
    });
}

/**
 * @route   GET /api/zoho/status
 * @desc    Get Zoho connection status for the current user
 * @access  Public (returns connected: false if no auth)
 */
router.get("/status", optionalAuth, CalendarController.getStatus);

/**
 * @route   GET /api/zoho/connect
 * @desc    Get Zoho OAuth2 authorization URL
 * @access  Private
 */
router.get(
    "/connect",
    resolveTenant,
    authenticateToken,
    requireAuth,
    CalendarController.connect
);

/**
 * @route   GET /api/zoho/callback
 * @desc    Zoho OAuth2 callback — exchanges code for tokens
 * @access  Public (called by Zoho redirect)
 */
router.get("/callback", CalendarController.callback);

/**
 * @route   POST /api/zoho/disconnect
 * @desc    Disconnect Zoho account (clears tokens)
 * @access  Private
 */
router.post(
    "/disconnect",
    resolveTenant,
    authenticateToken,
    requireAuth,
    CalendarController.disconnect
);

/**
 * @route   GET /api/zoho/events
 * @desc    Get events from Zoho Calendar (syncs to DB)
 * @access  Private
 * @query   startDate, endDate (ISO strings)
 */
router.get(
    "/events",
    resolveTenant,
    authenticateToken,
    requireAuth,
    CalendarController.getEvents
);

/**
 * @route   POST /api/zoho/events
 * @desc    Create a new event on Zoho Calendar
 * @access  Private
 * @body    { title, description?, startTime, endTime, location? }
 */
router.post(
    "/events",
    resolveTenant,
    authenticateToken,
    requireAuth,
    CalendarController.createEvent
);

/**
 * @route   PUT /api/zoho/events/:id
 * @desc    Update an existing event on Zoho Calendar
 * @access  Private
 * @param   id - DB record id
 */
router.put(
    "/events/:id",
    resolveTenant,
    authenticateToken,
    requireAuth,
    CalendarController.updateEvent
);

/**
 * @route   DELETE /api/zoho/events/:id
 * @desc    Delete an event from Zoho Calendar
 * @access  Private
 * @param   id - DB record id
 */
router.delete(
    "/events/:id",
    resolveTenant,
    authenticateToken,
    requireAuth,
    CalendarController.deleteEvent
);

/**
 * @route   POST /api/zoho/sync
 * @desc    Full sync: fetch all upcoming events from Zoho and upsert to DB
 * @access  Private
 */
router.post(
    "/sync",
    resolveTenant,
    authenticateToken,
    requireAuth,
    CalendarController.syncEvents
);

export default router;
