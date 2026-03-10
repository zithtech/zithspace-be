"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarController = void 0;
const database_1 = require("@/config/database");
const CalendarService_1 = require("@/services/calendar/CalendarService");
const MailService_1 = require("@/services/mail/MailService");
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
    // static async connect(req: AuthRequest, res: Response): Promise<void> {
    //     const { provider } = req.params;
    //     try {
    //         if (!req.user) {
    //             res.status(401).json({ success: false, error: "Authentication required" });
    //             return;
    //         }
    //         const authUrl = await CalendarService.getAuthUrl(provider.toUpperCase() as CalendarProvider, req.user.id);
    //         res.status(200).json({
    //             success: true,
    //             data: { authUrl },
    //         } as ApiResponse);
    //     } catch (error) {
    //         console.error("Calendar connect error:", error);
    //         res.status(500).json({
    //             success: false,
    //             error: "Failed to initiate calendar connection",
    //         } as ApiResponse);
    //     }
    // }
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
            // DISCONNECT ANY EXISTING PROVIDER FIRST
            await database_1.prisma.calendarIntegration.deleteMany({
                where: { userId: req.user.id }
            });
            // ALSO WIPE ALL LOCAL EVENTS TO PREVENT CROSS-PROVIDER LEAKAGE
            await database_1.prisma.calendarEvent.deleteMany({
                where: { userId: req.user.id }
            });
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
                return res.redirect(`${FRONTEND_URL}/integrations?error=${provider}_denied`);
            }
            if (!code || !state) {
                return res.redirect(`${FRONTEND_URL}/integrations?error=missing_params`);
            }
            // In our implementation, state is the userId
            const userId = state;
            // For now, we assume userId is sufficient to find the tenant or we'd need a more complex state
            const user = await database_1.prisma.user.findUnique({ where: { id: userId } });
            if (!user)
                throw new Error("User not found");
            const integration = await CalendarService_1.CalendarService.handleCallback(provider.toUpperCase(), userId, user.tenantId, code, state);
            if (integration) {
                // Sync events immediately after connection
                CalendarService_1.CalendarService.syncEvents(userId, user.tenantId, provider.toUpperCase()).catch(err => {
                    console.error(`Initial calendar sync failed for ${provider}:`, err);
                });
                // Sync mail immediately after connection
                // Assuming the email for MailAccount can be derived from the integration or fetched again
                const mailAccount = await database_1.prisma.mailAccount.findFirst({
                    where: { userId, tenantId: user.tenantId, provider: provider.toUpperCase() }
                });
                if (mailAccount) {
                    MailService_1.MailService.syncMail(userId, user.tenantId, mailAccount.email).catch(err => {
                        console.error(`Initial mail sync failed for ${provider}:`, err);
                    });
                }
            }
            res.redirect(`${FRONTEND_URL}/integrations?success=${provider}_connected`);
        }
        catch (error) {
            console.error("Calendar callback error:", error);
            res.redirect(`${FRONTEND_URL}/integrations?error=callback_failed`);
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
     * GET /api/calendar/providers
     * Returns all connected calendar providers for the current user.
     */
    static async getProviders(req, res) {
        try {
            if (!req.user) {
                res.status(200).json({
                    success: true,
                    data: [],
                });
                return;
            }
            const integrations = await database_1.prisma.calendarIntegration.findMany({
                where: {
                    userId: req.user.id,
                },
                select: {
                    provider: true,
                },
            });
            const providers = integrations.map(integration => integration.provider);
            res.status(200).json({
                success: true,
                data: providers,
            });
        }
        catch (error) {
            console.error("Get providers error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get providers",
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
            const { startDate, endDate, cacheBuster } = req.query;
            const startLimit = startDate ? new Date(startDate) : undefined;
            const endLimit = endDate ? new Date(endDate) : undefined;
            const events = await CalendarService_1.CalendarService.getEvents(req.user.id, req.user.tenantId, startLimit, endLimit);
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
    // static async createEvent(req: AuthRequest, res: Response): Promise<void> {
    //     try {
    //         if (!req.user) {
    //             res.status(401).json({ success: false, error: "Authentication required" });
    //             return;
    //         }
    //         const { provider, ...eventData } = req.body;
    //         if (!provider) {
    //             res.status(400).json({ success: false, error: "Provider is required (ZOHO, GOOGLE, MICROSOFT)" });
    //             return;
    //         }
    //         const event = await CalendarService.createEvent(
    //             req.user.id,
    //             req.user.tenantId!,
    //             provider.toUpperCase() as CalendarProvider,
    //             eventData
    //         );
    //         res.status(201).json({
    //             success: true,
    //             data: event,
    //             message: "Event created successfully",
    //         } as ApiResponse);
    //     } catch (error: any) {
    //         console.error("Create event error:", error);
    //         res.status(500).json({
    //             success: false,
    //             error: error.message || "Failed to create event",
    //         } as ApiResponse);
    //     }
    // }
    static async createEvent(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }
            console.log("🟣🟣🟣 BACKEND CONTROLLER - CREATE EVENT START 🟣🟣🟣");
            console.log("🟣 Full request body:", JSON.stringify(req.body, null, 2));
            const { provider, ...eventData } = req.body;
            console.log("🟣 Extracted provider:", provider);
            console.log("🟣 Extracted eventData:", JSON.stringify(eventData, null, 2));
            console.log("🟣 generateMeeting value:", eventData.generateMeeting);
            console.log("🟣 generateMeeting type:", typeof eventData.generateMeeting);
            if (!provider) {
                console.log("🟣 ERROR: No provider provided");
                res.status(400).json({ success: false, error: "Provider is required (ZOHO, GOOGLE, MICROSOFT)" });
                return;
            }
            const event = await CalendarService_1.CalendarService.createEvent(req.user.id, req.user.tenantId, provider.toUpperCase(), eventData);
            console.log("🟣 Event(s) created successfully");
            console.log("🟣🟣🟣 BACKEND CONTROLLER - CREATE EVENT END 🟣🟣🟣");
            res.status(201).json({
                success: true,
                data: event,
                message: "Event created successfully",
            });
        }
        catch (error) {
            console.error("🟣 Create event error:", error);
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
            const { action, occurrenceDate, ...restEventData } = eventData;
            const parsedAction = action !== undefined ? parseInt(action) : undefined;
            console.log(`[ZohoProvider] updateEvent called. action=${action}, type=${typeof action}, action===2: ${action === 2}`);
            // 1. Try finding the literal record (works for masters OR forked exceptions)
            let existingEvent = await database_1.prisma.calendarEvent.findUnique({
                where: { id },
            });
            let optimisticSuffix = "";
            let lookupId = id;
            // 2. If not found and looks like a virtual occurrence, fall back to master lookup
            if (!existingEvent && id.includes('_occ_')) {
                lookupId = id.split('_occ_')[0];
                optimisticSuffix = "_occ_" + id.split('_occ_')[1];
                existingEvent = await database_1.prisma.calendarEvent.findUnique({
                    where: { id: lookupId },
                });
            }
            if (!existingEvent || existingEvent.userId !== req.user.id) {
                res.status(404).json({ success: false, error: "Event not found" });
                return;
            }
            const targetExternalId = (parsedAction === 0)
                ? existingEvent.externalId + optimisticSuffix
                : existingEvent.externalId;
            const updatedEvent = await CalendarService_1.CalendarService.updateEvent(req.user.id, req.user.tenantId, existingEvent.provider, targetExternalId, restEventData, parsedAction, occurrenceDate, req.user.email);
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
            const parsedAction = action !== undefined ? parseInt(action) : undefined;
            console.log(`[CalendarController] Delete request - action: ${action}, parsedAction: ${parsedAction}, occurrenceDate: ${occurrenceDate}`);
            // 1. Try finding the literal record
            let existingEvent = await database_1.prisma.calendarEvent.findUnique({
                where: { id },
            });
            let lookupId = id;
            let optimisticSuffix = "";
            // 2. If not found and looks like a virtual occurrence, fall back to master lookup
            if (!existingEvent && id.includes('_occ_')) {
                lookupId = id.split('_occ_')[0];
                optimisticSuffix = "_occ_" + id.split('_occ_')[1];
                existingEvent = await database_1.prisma.calendarEvent.findUnique({
                    where: { id: lookupId },
                });
            }
            if (!existingEvent || existingEvent.userId !== req.user.id) {
                res.status(404).json({ success: false, error: "Event not found" });
                return;
            }
            // Only use the optimistic suffix if we are trying to delete a specific instance.
            // If we are deleting the whole series (action !== 0), we must target the master ID.
            // For single occurrence deletion (action === 0), we should target the master ID to create exception
            const targetExternalId = (parsedAction === 0)
                ? existingEvent.externalId // Use master ID for single occurrence deletion
                : existingEvent.externalId;
            await CalendarService_1.CalendarService.deleteEvent(req.user.id, req.user.tenantId, existingEvent.provider, targetExternalId, parsedAction, occurrenceDate, req.user.email);
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
            const { provider } = req.body;
            const query = { userId: req.user.id };
            if (provider) {
                query.provider = provider.toUpperCase();
            }
            const integrations = await database_1.prisma.calendarIntegration.findMany({
                where: query,
            });
            if (integrations.length === 0 && provider) {
                res.status(404).json({
                    success: false,
                    error: `No integration found for provider: ${provider}`,
                });
                return;
            }
            // Fire and forget incremental sync for each integration
            integrations.forEach(integ => {
                CalendarService_1.CalendarService.processIncrementalSync(integ.id).catch(err => {
                    console.error(`[CalendarController] Manual sync failed for ${integ.id}:`, err.message);
                });
            });
            res.status(202).json({
                success: true,
                message: "Incremental synchronization started in the background",
                data: integrations.map(i => ({ provider: i.provider, integrationId: i.id }))
            });
        }
        catch (error) {
            console.error("Sync error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to initiate sync",
            });
        }
    }
}
exports.CalendarController = CalendarController;
//# sourceMappingURL=calendarcontroller.js.map