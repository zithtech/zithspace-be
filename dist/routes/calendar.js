"use strict";
// import { Router } from "express";
// import {
//   authenticateToken,
//   requireAuth,
//   requireAdmin,
// } from "@/middleware/auth";
// import { resolveTenant } from "@/middleware/tenantContext";
// import { CalendarController } from "@/controllers/calendarcontroller";
Object.defineProperty(exports, "__esModule", { value: true });
// const router = Router();
// router.get("/connect", CalendarController.connect);
// router.get("/callback", CalendarController.callback);
// // ==================== MIDDLEWARE ====================
// // Resolve tenant for all zoho routes
// router.use(resolveTenant);
// // Require login/auth for all routes
// router.use(authenticateToken);
// router.use(requireAuth);
// // ==================== ZOHO CONNECTION ROUTES ====================
// /**
//  * Connect to Zoho - Redirect to Zoho login
//  * GET /api/zoho/connect
//  */
// // router.get("/connect", CalendarController.connect);
// /**
//  * OAuth callback - Zoho redirects here
//  * GET /api/zoho/callback
//  */
// // router.get("/callback", CalendarController.callback);
// /**
//  * Get connection status
//  * GET /api/zoho/status
//  */
// router.get("/status", CalendarController.status);
// /**
//  * Disconnect Zoho and clear data
//  * POST /api/zoho/disconnect
//  */
// router.post("/disconnect", CalendarController.disconnect);
// // ==================== CALENDAR ROUTES ====================
// /**
//  * Get all calendars from Zoho
//  * GET /api/zoho/calendars
//  */
// router.get("/calendars", CalendarController.getCalendars);
// // ==================== EVENT ROUTES ====================
// /**
//  * Get events for dropdown/select
//  * GET /api/zoho/events/select
//  */
// router.get("/events/select", CalendarController.getEventsForSelect);
// /**
//  * Get all events with pagination/filter
//  * GET /api/zoho/events
//  */
// router.get("/events", CalendarController.getEvents);
// /**
//  * Get event by ID
//  * GET /api/zoho/events/:id
//  */
// router.get("/events/:id", CalendarController.getEventById);
// /**
//  * Create event
//  * POST /api/zoho/events
//  */
// router.post("/events", CalendarController.createEvent);
// /**
//  * Sync events from Zoho
//  * POST /api/zoho/events/sync
//  */
// router.post("/events/sync", CalendarController.syncEvents);
// /**
//  * Update event (admin only)
//  * PUT /api/zoho/events/:id
//  */
// router.put("/events/:id", requireAdmin, CalendarController.updateEvent);
// /**
//  * Delete event (admin only)
//  * DELETE /api/zoho/events/:id
//  */
// router.delete("/events/:id", requireAdmin, CalendarController.deleteEvent);
// export default router;
// routes/zoho.routes.ts
const express_1 = require("express");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const calendarcontroller_1 = require("@/controllers/calendarcontroller");
const router = (0, express_1.Router)();
// ==================== PUBLIC ROUTES (NO TENANT REQUIRED) ====================
router.get("/connect", calendarcontroller_1.CalendarController.connect);
router.get("/callback", calendarcontroller_1.CalendarController.callback);
router.get("/status", calendarcontroller_1.CalendarController.status); // Make status public
// ==================== PROTECTED ROUTES (TENANT REQUIRED) ====================
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
// All other routes remain protected
router.post("/disconnect", calendarcontroller_1.CalendarController.disconnect);
router.get("/calendars", calendarcontroller_1.CalendarController.getCalendars);
router.get("/events", calendarcontroller_1.CalendarController.getEvents);
// routes/zoho.routes.ts - Add this line
router.post("/associate", calendarcontroller_1.CalendarController.associateTokens);
router.get("/events/select", calendarcontroller_1.CalendarController.getEventsForSelect);
router.get("/events/:id", calendarcontroller_1.CalendarController.getEventById);
router.post("/events", calendarcontroller_1.CalendarController.createEvent);
router.post("/events/sync", calendarcontroller_1.CalendarController.syncEvents);
router.put("/events/:id", auth_1.requireAdmin, calendarcontroller_1.CalendarController.updateEvent);
router.delete("/events/:id", auth_1.requireAdmin, calendarcontroller_1.CalendarController.deleteEvent);
exports.default = router;
//# sourceMappingURL=calendar.js.map