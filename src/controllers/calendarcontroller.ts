import { Response } from "express";
import { prisma, tenantAwarePrisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";
import { CalendarProvider } from "@prisma/client";
import { CalendarService } from "@/services/calendar/CalendarService";
import { MailService } from "@/services/mail/MailService";
import { UnifiedAuthService } from "@/services/UnifiedAuthService";
import { CalendarSyncProducer } from '../services/calendar/CalendarSyncProducer';
import { MailSyncProducer } from '../services/mail/MailSyncProducer';
import { PushNotificationService } from '@/services/pushNotificationService';
import crypto from "crypto";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

function getAbsoluteReturnUrl(inputUrl: string | undefined, frontendUrl: string, subdomain?: string): string {
    let target = inputUrl || "/calendar";
    if (target.startsWith("http://") || target.startsWith("https://")) {
        return target;
    }
    try {
        const urlObj = new URL(frontendUrl);
        if (subdomain) {
            let host = urlObj.hostname;
            if (host.startsWith('www.')) {
                host = host.slice(4);
            }
            if (host === "localhost" || host === "127.0.0.1") {
                urlObj.hostname = `${subdomain}.localhost`;
            } else {
                if (host.startsWith(`${subdomain}.`)) {
                    urlObj.hostname = host;
                } else {
                    const parts = host.split('.');
                    // If the host seems to already have a subdomain (e.g., zithmi.zukvo.com)
                    if (parts.length >= 3) {
                        const rootDomain = parts.slice(1).join('.');
                        urlObj.hostname = `${subdomain}.${rootDomain}`;
                    } else {
                        urlObj.hostname = `${subdomain}.${host}`;
                    }
                }
            }
        }
        // Ensure path starts with slash
        const path = target.startsWith("/") ? target : `/${target}`;
        urlObj.pathname = path;
        return urlObj.toString();
    } catch {
        return `${frontendUrl}/calendar`;
    }
}

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
                    isSyncing: (integration as any)?.isSyncing || false,
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
    static async connect(req: AuthRequest, res: Response): Promise<void> {
        const { provider } = req.params;
        const { returnUrl } = req.query as Record<string, string>;
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

            // Encode and sign the multi-tenant state parameter
            const targetReturnUrl = getAbsoluteReturnUrl(returnUrl, FRONTEND_URL, req.tenant?.subdomain);
            const statePayload = JSON.stringify({
                tenantId: req.tenantId || req.user.tenantId,
                userId: req.user.id,
                returnUrl: targetReturnUrl
            });
            const secret = process.env.JWT_SECRET || "your-secret-key-change-in-production";
            const signature = crypto.createHmac("sha256", secret).update(statePayload).digest("hex");
            const state = Buffer.from(JSON.stringify({ payload: statePayload, signature })).toString("base64url");

            const authUrl = UnifiedAuthService.getAuthUrl(provider.toUpperCase() as CalendarProvider, state);

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
        let returnUrl = `${FRONTEND_URL}/calendar`;
        try {
            const { provider } = req.params;
            const { code, state, error: oauthError } = req.query as Record<string, string>;

            // Try to extract returnUrl from state as early as possible to handle error redirects correctly
            if (state) {
                try {
                    const decodedStateStr = Buffer.from(state, "base64url").toString("utf8");
                    const decodedState = JSON.parse(decodedStateStr);
                    if (decodedState.payload) {
                        const payloadObj = JSON.parse(decodedState.payload);
                        returnUrl = payloadObj.returnUrl || returnUrl;
                    } else if (decodedState.returnUrl) {
                        returnUrl = decodedState.returnUrl;
                    }
                } catch (e: any) {
                    console.warn("[CalendarController] Early state decode failed:", e.message);
                }
            }

            if (oauthError) {
                console.error(`${provider} OAuth error:`, oauthError);
                let errorRedirectUrl: string;
                try {
                    const urlObj = new URL(returnUrl);
                    urlObj.searchParams.set("error", `${provider}_denied`);
                    errorRedirectUrl = urlObj.toString();
                } catch {
                    const connector = returnUrl.includes("?") ? "&" : "?";
                    errorRedirectUrl = `${returnUrl}${connector}error=${provider}_denied`;
                }
                return res.redirect(errorRedirectUrl) as any;
            }

            if (!code || !state) {
                let errorRedirectUrl: string;
                try {
                    const urlObj = new URL(returnUrl);
                    urlObj.searchParams.set("error", "missing_params");
                    errorRedirectUrl = urlObj.toString();
                } catch {
                    const connector = returnUrl.includes("?") ? "&" : "?";
                    errorRedirectUrl = `${returnUrl}${connector}error=missing_params`;
                }
                return res.redirect(errorRedirectUrl) as any;
            }

            // Decode state parameter
            let tenantId: string = "";
            let userId: string = "";

            try {
                const decodedStateStr = Buffer.from(state, "base64url").toString("utf8");
                const decodedState = JSON.parse(decodedStateStr);

                if (decodedState.payload && decodedState.signature) {
                    // Signed multi-tenant state
                    const secret = process.env.JWT_SECRET || "your-secret-key-change-in-production";
                    const expectedSignature = crypto.createHmac("sha256", secret).update(decodedState.payload).digest("hex");
                    if (decodedState.signature !== expectedSignature) {
                        throw new Error("Invalid state signature (tampered payload or CSRF attempt)");
                    }
                    const payloadObj = JSON.parse(decodedState.payload);
                    tenantId = payloadObj.tenantId;
                    userId = payloadObj.userId;
                    returnUrl = payloadObj.returnUrl;
                } else if (decodedState.userId && decodedState.tenantId) {
                    // Unsigned JSON state fallback
                    tenantId = decodedState.tenantId;
                    userId = decodedState.userId;
                    returnUrl = decodedState.returnUrl || returnUrl;
                } else {
                    throw new Error("Unknown state payload structure");
                }
            } catch (err: any) {
                console.warn("[CalendarController] State decode failed, trying fallback to legacy state (plain userId):", err.message);
                // Fallback to legacy state (plain userId)
                userId = state;
                const user = await prisma.user.findUnique({ where: { id: userId } });
                if (!user) throw new Error(`User not found and state parsing failed: ${err.message}`);
                tenantId = user.tenantId;
            }

            // Establish row-level isolation context
            await tenantAwarePrisma.setTenantContext(tenantId);

            const mailAccount = await UnifiedAuthService.handleCallback(
                provider.toUpperCase() as CalendarProvider,
                code,
                state,
                userId,
                tenantId
            );

            // Sync Calendar immediately after connection.
            // Strategy: Fire a direct full syncEvents() in background FIRST (guaranteed, no RabbitMQ dependency),
            // then ALSO enqueue via RabbitMQ for resilience.
            // This mirrors CalendarController.syncEvents which always does both.
            const integration = await prisma.calendarIntegration.findFirst({
                where: { userId, provider: provider.toUpperCase() as CalendarProvider }
            });

            if (integration) {
                // DIRECT background sync — fires immediately, no queue dependency.
                // Uses full /events API (not delta) so all fields (subject, etc.) are always present.
                CalendarService.syncEvents(
                    integration.userId,
                    integration.tenantId,
                    integration.provider
                ).catch(err => console.error("[CalendarController] Direct initial syncEvents failed:", err.message));

                // ALSO enqueue via RabbitMQ for incremental sync setup (deltaLink initialization)
                CalendarSyncProducer.enqueueSync({
                    integrationId: integration.id,
                    userId: integration.userId,
                    tenantId: integration.tenantId,
                    provider: integration.provider,
                    forceSync: true
                }).catch(err => console.warn("[CalendarController] RabbitMQ enqueue failed (direct sync already running):", err.message));
            }

            if (mailAccount && mailAccount.email) {
                await MailSyncProducer.enqueueSync({
                    userId,
                    tenantId: tenantId,
                    email: mailAccount.email
                }).catch(err => console.error("Initial mail enqueue failed:", err));
            }

            // Safely redirect back to returnUrl with connection status parameters
            let redirectUrl: string;
            try {
                const urlObj = new URL(returnUrl);
                urlObj.searchParams.set("connected", "true");
                urlObj.searchParams.set("provider", provider);
                redirectUrl = urlObj.toString();
            } catch {
                const connector = returnUrl.includes("?") ? "&" : "?";
                redirectUrl = `${returnUrl}${connector}connected=true&provider=${provider}`;
            }

            res.redirect(redirectUrl);
        } catch (error: any) {
            console.error("Calendar callback error:", error);
            // Safely redirect back with error status parameters
            let errorRedirectUrl: string;
            try {
                const urlObj = new URL(returnUrl);
                urlObj.searchParams.set("error", "callback_failed");
                errorRedirectUrl = urlObj.toString();
            } catch {
                const connector = returnUrl.includes("?") ? "&" : "?";
                errorRedirectUrl = `${returnUrl}${connector}error=callback_failed`;
            }
            res.redirect(errorRedirectUrl);
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

            // WIPE ALL LOCAL EVENTS TO PREVENT CROSS-PROVIDER LEAKAGE OR ORPHANED DATA
            await prisma.calendarEvent.deleteMany({
                where: {
                    userId: req.user.id,
                    provider: provider.toUpperCase() as CalendarProvider,
                }
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
                    tenantId: req.user.tenantId,
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
     * POST /api/calendar/events/check-overlap
     * Returns any events that overlap with the given time range for the current user.
     */
    static async checkOverlap(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }

            const { startTime, endTime, excludeEventId } = req.body;

            if (!startTime || !endTime) {
                res.status(400).json({ success: false, error: "startTime and endTime are required" });
                return;
            }

            const overlaps = await CalendarService.checkForOverlap(
                req.user.id,
                req.user.tenantId!,
                new Date(startTime),
                new Date(endTime),
                excludeEventId
            );

            res.status(200).json({
                success: true,
                data: {
                    hasOverlap: overlaps.length > 0,
                    count: overlaps.length,
                    overlaps: overlaps.map(o => ({
                        id: o.id,
                        title: o.title,
                        startTime: o.startTime,
                        endTime: o.endTime
                    }))
                }
            } as ApiResponse);
        } catch (error: any) {
            console.error("Check overlap error:", error);
            res.status(500).json({
                success: false,
                error: error.message || "Failed to check for event overlaps",
            } as ApiResponse);
        }
    }

    /**
     * POST /api/calendar/events
     * Creates a new event on a specific provider.
     */


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

            // Extract attendee emails and send system-level notifications asynchronously
            if (eventData.attendees && Array.isArray(eventData.attendees)) {
                const attendeeEmails: string[] = [];
                for (const attendee of eventData.attendees) {
                    let email = '';
                    if (typeof attendee === 'string') {
                        email = attendee;
                    } else if (typeof attendee === 'object' && attendee !== null) {
                        email = attendee.email || attendee.emailAddress?.address || attendee.address || '';
                    }
                    if (email && email.includes('@')) {
                        attendeeEmails.push(email.trim().toLowerCase());
                    }
                }

                // Filter out the organizer/creator's own email so they do not receive a notification for their own meeting
                const creatorEmail = req.user?.email ? req.user.email.trim().toLowerCase() : '';
                const filteredEmails = attendeeEmails.filter(email => email !== creatorEmail);

                if (filteredEmails.length > 0) {
                    const managerName = req.user.name || "A manager";
                    const meetingTitle = eventData.title || eventData.subject || "New Meeting";

                    PushNotificationService.sendNotificationToEmails(filteredEmails, {
                        title: 'New Meeting Scheduled',
                        body: `${managerName} has scheduled a meeting: "${meetingTitle}"`,
                        url: '/calendar'
                    }).catch(err => {
                        console.error("[CalendarController] Push notification failed:", err.message);
                    });
                }
            }

            // Emit Socket.io real-time event
            try {
                const { socketService } = require("@/services/socketService");
                const managerName = req.user.name || "A manager";
                const meetingTitle = eventData.title || eventData.subject || "New Meeting";

                socketService.emitToTenant(req.user.tenantId!, "meeting-created", {
                    title: 'New Meeting Scheduled',
                    body: `${managerName} has scheduled a meeting: "${meetingTitle}"`,
                    meetingTitle,
                    managerName,
                    event
                });
                console.log("Meeting created event sent");
            } catch (socketErr: any) {
                console.error("Failed to emit meeting-created socket event:", socketErr.message);
            }

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
            const tenantId = req.user.tenantId!;

            const { action, occurrenceDate, ...restEventData } = eventData;
            const parsedAction = action !== undefined ? parseInt(action) : undefined;
            console.log(`[ZohoProvider] updateEvent called. action=${action}, type=${typeof action}, action===2: ${action === 2}`);
            // 1. Try finding the literal record scoped to this user AND tenant (prevents cross-tenant access)
            let existingEvent = await prisma.calendarEvent.findFirst({
                where: { id, userId: req.user.id, tenantId },
            });

            let optimisticSuffix = "";
            let lookupId = id;

            // 2. If not found and looks like a virtual occurrence, fall back to master lookup
            if (!existingEvent && id.includes('_occ_')) {
                lookupId = id.split('_occ_')[0];
                optimisticSuffix = "_occ_" + id.split('_occ_')[1];

                existingEvent = await prisma.calendarEvent.findFirst({
                    where: { id: lookupId, userId: req.user.id, tenantId },
                });
            }

            if (!existingEvent) {
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
            const tenantId = req.user.tenantId!;

            console.log(`[CalendarController] Delete request - action: ${action}, parsedAction: ${parsedAction}, occurrenceDate: ${occurrenceDate}`);

            // 1. Try finding the literal record scoped to this user AND tenant (prevents cross-tenant access)
            let existingEvent = await prisma.calendarEvent.findFirst({
                where: { id, userId: req.user.id, tenantId },
            });

            let lookupId = id;
            let optimisticSuffix = "";

            // 2. If not found and looks like a virtual occurrence, fall back to master lookup
            if (!existingEvent && id.includes('_occ_')) {
                lookupId = id.split('_occ_')[0];
                optimisticSuffix = "_occ_" + id.split('_occ_')[1];

                existingEvent = await prisma.calendarEvent.findFirst({
                    where: { id: lookupId, userId: req.user.id, tenantId },
                });
            }

            if (!existingEvent) {
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
            // Always scope by BOTH userId and tenantId to prevent cross-tenant sync triggers
            const query: any = { userId: req.user.id, tenantId: req.user.tenantId };
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

            // Dispatch sync jobs directly in the background & attempt RabbitMQ enqueue
            for (const integ of integrations) {
                // Trigger incremental sync directly in background process to guarantee execution
                CalendarService.processIncrementalSync(integ.id).catch(err => {
                    console.error(`[CalendarController] Background sync failed for ${integ.id}:`, err.message);
                });

                try {
                    await CalendarSyncProducer.enqueueSync({
                        integrationId: integ.id,
                        userId: integ.userId,
                        tenantId: integ.tenantId,
                        provider: integ.provider,
                        forceSync: true
                    });
                } catch (enqueueError: any) {
                    console.warn(`[CalendarController] Optional RabbitMQ enqueue failed for ${integ.id}:`, enqueueError.message);
                }
            }

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
