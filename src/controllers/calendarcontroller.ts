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
     * GET /api/calendar/events
     * Fetches events from local database (which are synced from providers).
     */
    static async getEvents(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }

            const { startDate, endDate } = req.query as Record<string, string>;

            const events = await prisma.calendarEvent.findMany({
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

        console.log("🟣 Event created successfully:", event.id);
        console.log("🟣 Meeting link in response:", event.meetingLink);
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

            const existingEvent = await prisma.calendarEvent.findUnique({
                where: { id },
            });

            if (!existingEvent || existingEvent.userId !== req.user.id) {
                res.status(404).json({ success: false, error: "Event not found" });
                return;
            }

            const updatedEvent = await CalendarService.updateEvent(
                req.user.id,
                req.user.tenantId!,
                existingEvent.provider,
                existingEvent.externalId,
                eventData
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

            const existingEvent = await prisma.calendarEvent.findUnique({
                where: { id },
            });

            if (!existingEvent || existingEvent.userId !== req.user.id) {
                res.status(404).json({ success: false, error: "Event not found" });
                return;
            }

            await CalendarService.deleteEvent(
                req.user.id,
                req.user.tenantId!,
                existingEvent.provider,
                existingEvent.externalId,
                action !== undefined ? parseInt(action) : undefined,
                occurrenceDate
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

            const integrations = await prisma.calendarIntegration.findMany({
                where: { userId: req.user.id },
            });

            const results = await Promise.all(integrations.map(async (integ) => {
                try {
                    const count = await CalendarService.syncEvents(req.user!.id, req.user!.tenantId!, integ.provider);
                    return { provider: integ.provider, synced: count, status: "success" };
                } catch (err: any) {
                    return { provider: integ.provider, error: err.message, status: "error" };
                }
            }));

            res.status(200).json({
                success: true,
                data: results,
                message: "Sync completed",
            } as ApiResponse);
        } catch (error) {
            console.error("Sync error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to sync calendars",
            } as ApiResponse);
        }
    }
}
