import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";
import { CalendarProvider } from "@prisma/client";
import { CalendarService } from "@/services/calendar/CalendarService";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

export class CalendarController {
    /**
     * GET /api/calendar/:provider/status
     * Returns whether the current user has connected a specific provider.
     */
    static async getStatus(req: AuthRequest, res: Response): Promise<void> {
        const { provider } = req.params;
        try {
            if (!req.user) {
                res.status(200).json({
                    success: true,
                    data: { connected: false },
                } as ApiResponse);
                return;
            }

            const integration = await prisma.calendarIntegration.findUnique({
                where: {
                    userId_provider: {
                        userId: req.user.id,
                        provider: provider.toUpperCase() as CalendarProvider,
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
            } as ApiResponse);
        } catch (error) {
            console.error("Calendar status error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get calendar status",
            } as ApiResponse);
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
    static async connect(req: AuthRequest, res: Response): Promise<void> {
        const { provider } = req.params;
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }

            // DISCONNECT ANY EXISTING PROVIDER FIRST
            await prisma.calendarIntegration.deleteMany({
                where: { userId: req.user.id }
            });

            // ALSO WIPE ALL LOCAL EVENTS TO PREVENT CROSS-PROVIDER LEAKAGE
            await prisma.calendarEvent.deleteMany({
                where: { userId: req.user.id }
            });

            const authUrl = await CalendarService.getAuthUrl(provider.toUpperCase() as CalendarProvider, req.user.id);

            res.status(200).json({
                success: true,
                data: { authUrl },
            } as ApiResponse);
        } catch (error) {
            console.error("Calendar connect error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to initiate calendar connection",
            } as ApiResponse);
        }
    }

    /**
     * GET /api/calendar/:provider/callback
     * Handles the OAuth callback from a provider.
     */
    static async callback(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { provider } = req.params;
            const { code, state, error: oauthError } = req.query as Record<string, string>;

            if (oauthError) {
                console.error(`${provider} OAuth error:`, oauthError);
                return res.redirect(`${FRONTEND_URL}/calendar?error=${provider}_denied`) as any;
            }

            if (!code || !state) {
                return res.redirect(`${FRONTEND_URL}/calendar?error=missing_params`) as any;
            }

            // In our implementation, state is the userId
            const userId = state;

            // For now, we assume userId is sufficient to find the tenant or we'd need a more complex state
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) throw new Error("User not found");

            await CalendarService.handleCallback(
                provider.toUpperCase() as CalendarProvider,
                userId,
                user.tenantId,
                code,
                state
            );

            // Sync events immediately after connection
            await CalendarService.syncEvents(userId, user.tenantId, provider.toUpperCase() as CalendarProvider).catch(err => {
                console.error(`Initial sync failed for ${provider}:`, err);
            });

            res.redirect(`${FRONTEND_URL}/calendar?connected=true&provider=${provider}`);
        } catch (error) {
            console.error("Calendar callback error:", error);
            res.redirect(`${FRONTEND_URL}/calendar?error=callback_failed`);
        }
    }

    /**
     * POST /api/calendar/:provider/disconnect
     */
    static async disconnect(req: AuthRequest, res: Response): Promise<void> {
        const { provider } = req.params;
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }

            await prisma.calendarIntegration.deleteMany({
                where: {
                    userId: req.user.id,
                    provider: provider.toUpperCase() as CalendarProvider,
                },
            });

            res.status(200).json({
                success: true,
                message: `${provider} disconnected successfully`,
            } as ApiResponse);
        } catch (error) {
            console.error("Calendar disconnect error:", error);
            res.status(500).json({
                success: false,
                error: `Failed to disconnect ${provider}`,
            } as ApiResponse);
        }
    }

    /**
     * GET /api/calendar/providers
     * Returns all connected calendar providers for the current user.
     */
    static async getProviders(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(200).json({
                    success: true,
                    data: [],
                } as ApiResponse);
                return;
            }

            const integrations = await prisma.calendarIntegration.findMany({
                where: {
                    userId: req.user.id,
                },
                select: {
                    provider: true,
                },
            });

            const providers = integrations.map(integration => integration.provider as CalendarProvider);

            res.status(200).json({
                success: true,
                data: providers,
            } as ApiResponse);
        } catch (error) {
            console.error("Get providers error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get providers",
            } as ApiResponse);
        }
    }

    /**
     * GET /api/calendar/events
     * Fetches events from local database (which are synced from providers).
     */
    static async getEvents(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }

            const { startDate, endDate, cacheBuster } = req.query as Record<string, string>;
            const startLimit = startDate ? new Date(startDate) : undefined;
            const endLimit = endDate ? new Date(endDate) : undefined;

            const events = await CalendarService.getEvents(
                req.user.id,
                req.user.tenantId,
                startLimit,
                endLimit
            );

            res.status(200).json({
                success: true,
                data: events,
            } as ApiResponse);
        } catch (error) {
            console.error("Get events error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch events",
            } as ApiResponse);
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

    static async createEvent(req: AuthRequest, res: Response): Promise<void> {
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

            const event = await CalendarService.createEvent(
                req.user.id,
                req.user.tenantId!,
                provider.toUpperCase() as CalendarProvider,
                eventData
            );

            console.log("🟣 Event(s) created successfully");
            console.log("🟣🟣🟣 BACKEND CONTROLLER - CREATE EVENT END 🟣🟣🟣");

            res.status(201).json({
                success: true,
                data: event,
                message: "Event created successfully",
            } as ApiResponse);
        } catch (error: any) {
            console.error("🟣 Create event error:", error);
            res.status(500).json({
                success: false,
                error: error.message || "Failed to create event",
            } as ApiResponse);
        }
    }

    /**
     * PUT /api/calendar/events/:id
     */
    static async updateEvent(req: AuthRequest, res: Response): Promise<void> {
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
            let existingEvent = await prisma.calendarEvent.findUnique({
                where: { id },
            });

            let optimisticSuffix = "";
            let lookupId = id;

            // 2. If not found and looks like a virtual occurrence, fall back to master lookup
            if (!existingEvent && id.includes('_occ_')) {
                lookupId = id.split('_occ_')[0];
                optimisticSuffix = "_occ_" + id.split('_occ_')[1];

                existingEvent = await prisma.calendarEvent.findUnique({
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

            const updatedEvent = await CalendarService.updateEvent(
                req.user.id,
                req.user.tenantId!,
                existingEvent.provider,
                targetExternalId,
                restEventData,
                parsedAction,
                occurrenceDate,
                req.user.email
            );

            res.status(200).json({
                success: true,
                data: updatedEvent,
                message: "Event updated successfully",
            } as ApiResponse);
        } catch (error: any) {
            console.error("Update event error:", error);
            res.status(500).json({
                success: false,
                error: error.message || "Failed to update event",
            } as ApiResponse);
        }
    }

    /**
     * DELETE /api/calendar/events/:id
     */
    static async deleteEvent(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }

            const { id } = req.params;
            const { action, occurrenceDate } = req.query as Record<string, string>;
            const parsedAction = action !== undefined ? parseInt(action) : undefined;
            
            console.log(`[CalendarController] Delete request - action: ${action}, parsedAction: ${parsedAction}, occurrenceDate: ${occurrenceDate}`);

            // 1. Try finding the literal record
            let existingEvent = await prisma.calendarEvent.findUnique({
                where: { id },
            });

            let lookupId = id;
            let optimisticSuffix = "";

            // 2. If not found and looks like a virtual occurrence, fall back to master lookup
            if (!existingEvent && id.includes('_occ_')) {
                lookupId = id.split('_occ_')[0];
                optimisticSuffix = "_occ_" + id.split('_occ_')[1];

                existingEvent = await prisma.calendarEvent.findUnique({
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
                ? existingEvent.externalId  // Use master ID for single occurrence deletion
                : existingEvent.externalId;

            await CalendarService.deleteEvent(
                req.user.id,
                req.user.tenantId!,
                existingEvent.provider,
                targetExternalId,
                parsedAction,
                occurrenceDate,
                req.user.email
            );

            res.status(200).json({
                success: true,
                message: "Event deleted successfully",
            } as ApiResponse);
        } catch (error: any) {
            console.error("Delete event error:", error);
            res.status(500).json({
                success: false,
                error: error.message || "Failed to delete event",
            } as ApiResponse);
        }
    }

    /**
     * POST /api/calendar/sync
     * Syncs all connected calendars for the current user.
     */
    static async syncEvents(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }

            const { provider } = req.body;
            const query: any = { userId: req.user.id };
            if (provider) {
                query.provider = provider.toUpperCase() as CalendarProvider;
            }

            const integrations = await prisma.calendarIntegration.findMany({
                where: query,
            });

            if (integrations.length === 0 && provider) {
                res.status(404).json({
                    success: false,
                    error: `No integration found for provider: ${provider}`,
                } as ApiResponse);
                return;
            }

            // Fire and forget incremental sync for each integration
            integrations.forEach(integ => {
                CalendarService.processIncrementalSync(integ.id).catch(err => {
                    console.error(`[CalendarController] Manual sync failed for ${integ.id}:`, err.message);
                });
            });

            res.status(202).json({
                success: true,
                message: "Incremental synchronization started in the background",
                data: integrations.map(i => ({ provider: i.provider, integrationId: i.id }))
            } as ApiResponse);
        } catch (error) {
            console.error("Sync error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to initiate sync",
            } as ApiResponse);
        }
    }
}
