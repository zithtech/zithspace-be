"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarController = void 0;
const database_1 = require("@/config/database");
const CalendarService_1 = require("@/services/calendar/CalendarService");
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
class CalendarController {
    /**
     * GET /api/calendar/:provider/status
     * Returns whether the current user has connected a specific provider.
     */
    static async getStatus(req, res) {
        const { provider } = req.params;
        try {
            if (!req.user) {
                res.status(200).json({
                    success: true,
                    data: { connected: false },
                });
                return;
            }
            const integration = await database_1.prisma.calendarIntegration.findUnique({
                where: {
                    userId_provider: {
                        userId: req.user.id,
                        provider: provider.toUpperCase(),
                    },
                },
            });
            res.status(200).json({
                success: true,
                data: {
                    connected: !!integration,
                    provider,
                    lastSync: integration?.updatedAt || null,
                },
            });
        }
        catch (error) {
            console.error("Calendar status error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get calendar status",
            });
        }
    }
    /**
     * GET /api/calendar/:provider/connect
     * Initiates the OAuth flow for a provider.
     */
    static async connect(req, res) {
        const { provider } = req.params;
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }
            const authUrl = await CalendarService_1.CalendarService.getAuthUrl(provider.toUpperCase(), req.user.id);
            res.status(200).json({
                success: true,
                data: { authUrl },
            });
        }
        catch (error) {
            console.error("Calendar connect error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to initiate calendar connection",
            });
        }
    }
    /**
     * GET /api/calendar/:provider/callback
     * Handles the OAuth callback from a provider.
     */
    static async callback(req, res) {
        try {
            const { provider } = req.params;
            const { code, state, error: oauthError } = req.query;
            if (oauthError) {
                console.error(`${provider} OAuth error:`, oauthError);
                return res.redirect(`${FRONTEND_URL}/calendar?error=${provider}_denied`);
            }
            if (!code || !state) {
                return res.redirect(`${FRONTEND_URL}/calendar?error=missing_params`);
            }
            // In our implementation, state is the userId
            const userId = state;
            // For now, we assume userId is sufficient to find the tenant or we'd need a more complex state
            const user = await database_1.prisma.user.findUnique({ where: { id: userId } });
            if (!user)
                throw new Error("User not found");
            await CalendarService_1.CalendarService.handleCallback(provider.toUpperCase(), userId, user.tenantId, code, state);
            // Sync events immediately after connection
            await CalendarService_1.CalendarService.syncEvents(userId, user.tenantId, provider.toUpperCase()).catch(err => {
                console.error(`Initial sync failed for ${provider}:`, err);
            });
            res.redirect(`${FRONTEND_URL}/calendar?connected=true&provider=${provider}`);
        }
        catch (error) {
            console.error("Calendar callback error:", error);
            res.redirect(`${FRONTEND_URL}/calendar?error=callback_failed`);
        }
    }
    /**
     * POST /api/calendar/:provider/disconnect
     */
    static async disconnect(req, res) {
        const { provider } = req.params;
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }
            await database_1.prisma.calendarIntegration.deleteMany({
                where: {
                    userId: req.user.id,
                    provider: provider.toUpperCase(),
                },
            });
            res.status(200).json({
                success: true,
                message: `${provider} disconnected successfully`,
            });
        }
        catch (error) {
            console.error("Calendar disconnect error:", error);
            res.status(500).json({
                success: false,
                error: `Failed to disconnect ${provider}`,
            });
        }
    }
    /**
     * GET /api/calendar/events
     * Fetches events from local database (which are synced from providers).
     */
    static async getEvents(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }
            const { startDate, endDate } = req.query;
            const events = await database_1.prisma.calendarEvent.findMany({
                where: {
                    userId: req.user.id,
                    tenantId: req.user.tenantId,
                    OR: [
                        { isRecurring: true },
                        {
                            AND: [
                                startDate ? { startTime: { gte: new Date(startDate) } } : {},
                                endDate ? { startTime: { lte: new Date(endDate) } } : {},
                            ]
                        }
                    ]
                },
                orderBy: { startTime: "asc" },
            });
            res.status(200).json({
                success: true,
                data: events,
            });
        }
        catch (error) {
            console.error("Get events error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch events",
            });
        }
    }
    /**
     * POST /api/calendar/events
     * Creates a new event on a specific provider.
     */
    static async createEvent(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }
            const { provider, ...eventData } = req.body;
            if (!provider) {
                res.status(400).json({ success: false, error: "Provider is required (ZOHO, GOOGLE, MICROSOFT)" });
                return;
            }
            const event = await CalendarService_1.CalendarService.createEvent(req.user.id, req.user.tenantId, provider.toUpperCase(), eventData);
            res.status(201).json({
                success: true,
                data: event,
                message: "Event created successfully",
            });
        }
        catch (error) {
            console.error("Create event error:", error);
            res.status(500).json({
                success: false,
                error: error.message || "Failed to create event",
            });
        }
    }
    /**
     * PUT /api/calendar/events/:id
     */
    static async updateEvent(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }
            const { id } = req.params;
            const eventData = req.body;
            const existingEvent = await database_1.prisma.calendarEvent.findUnique({
                where: { id },
            });
            if (!existingEvent || existingEvent.userId !== req.user.id) {
                res.status(404).json({ success: false, error: "Event not found" });
                return;
            }
            const updatedEvent = await CalendarService_1.CalendarService.updateEvent(req.user.id, req.user.tenantId, existingEvent.provider, existingEvent.externalId, eventData);
            res.status(200).json({
                success: true,
                data: updatedEvent,
                message: "Event updated successfully",
            });
        }
        catch (error) {
            console.error("Update event error:", error);
            res.status(500).json({
                success: false,
                error: error.message || "Failed to update event",
            });
        }
    }
    /**
     * DELETE /api/calendar/events/:id
     */
    static async deleteEvent(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }
            const { id } = req.params;
            const { action, occurrenceDate } = req.query;
            const existingEvent = await database_1.prisma.calendarEvent.findUnique({
                where: { id },
            });
            if (!existingEvent || existingEvent.userId !== req.user.id) {
                res.status(404).json({ success: false, error: "Event not found" });
                return;
            }
            await CalendarService_1.CalendarService.deleteEvent(req.user.id, req.user.tenantId, existingEvent.provider, existingEvent.externalId, action !== undefined ? parseInt(action) : undefined, occurrenceDate);
            res.status(200).json({
                success: true,
                message: "Event deleted successfully",
            });
        }
        catch (error) {
            console.error("Delete event error:", error);
            res.status(500).json({
                success: false,
                error: error.message || "Failed to delete event",
            });
        }
    }
    /**
     * POST /api/calendar/sync
     * Syncs all connected calendars for the current user.
     */
    static async syncEvents(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }
            const integrations = await database_1.prisma.calendarIntegration.findMany({
                where: { userId: req.user.id },
            });
            const results = await Promise.all(integrations.map(async (integ) => {
                try {
                    const count = await CalendarService_1.CalendarService.syncEvents(req.user.id, req.user.tenantId, integ.provider);
                    return { provider: integ.provider, synced: count, status: "success" };
                }
                catch (err) {
                    return { provider: integ.provider, error: err.message, status: "error" };
                }
            }));
            res.status(200).json({
                success: true,
                data: results,
                message: "Sync completed",
            });
        }
        catch (error) {
            console.error("Sync error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to sync calendars",
            });
        }
    }
}
exports.CalendarController = CalendarController;
//# sourceMappingURL=calendarcontroller.js.map