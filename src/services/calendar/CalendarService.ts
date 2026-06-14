import { prisma } from "@/config/database";
import { CalendarProvider, CalendarIntegration, CalendarEvent } from "@prisma/client";
import axios from "axios";
import { CalendarProviderFactory } from "./CalendarProviderFactory";
import { CalendarEventData } from "./ICalendarProvider";
import { createClient } from "redis";
import { syncLogger } from "@/utils/logger";

// Singleton Redis client for distributed locking
let redisClient: ReturnType<typeof createClient> | null = null;
async function getRedisClient() {
    if (!redisClient) {
        redisClient = createClient({
            socket: {
                host: process.env.REDIS_HOST || '127.0.0.1',
                port: parseInt(process.env.REDIS_PORT || '6379'),
            },
            password: process.env.REDIS_PASSWORD || undefined,
        });
        redisClient.on('error', (err) => syncLogger.error('Redis error', { error: err.message }));
        await redisClient.connect();
    }
    return redisClient;
}

export class CalendarService {
    /**
     * Get the authorization URL for a specific provider.
     */
    static async getAuthUrl(provider: CalendarProvider, userId: string): Promise<string> {
        return CalendarProviderFactory.getProvider(provider).getAuthUrl(userId);
    }

    /**
     * Handle the OAuth callback and save integration details.
     */
    // static async handleCallback(provider: CalendarProvider, userId: string, tenantId: string, code: string, state: string) {
    //     const providerImpl = CalendarProviderFactory.getProvider(provider);
    //     const result = await providerImpl.handleCallback(code, state);

    //     const expiry = new Date(Date.now() + result.expiresIn * 1000);

    //     return await prisma.calendarIntegration.upsert({
    //         where: { userId_provider: { userId, provider } },
    //         create: {
    //             id: `${userId}_${provider}`,
    //             userId,
    //             tenantId,
    //             provider,
    //             accessToken: result.accessToken,
    //             refreshToken: result.refreshToken,
    //             tokenExpiry: expiry,
    //             calendarId: result.calendarId,
    //         },
    //         update: {
    //             accessToken: result.accessToken,
    //             refreshToken: result.refreshToken || undefined,
    //             tokenExpiry: expiry,
    //             calendarId: result.calendarId || undefined,
    //         },
    //     });
    // }

    /**
 * Handle the OAuth callback and save integration details.
 */
    static async handleCallback(provider: CalendarProvider, userId: string, tenantId: string, code: string, state: string) {
        const providerImpl = CalendarProviderFactory.getProvider(provider);
        const result = await providerImpl.handleCallback(code, state);

        const expiry = new Date(Date.now() + result.expiresIn * 1000);

        // FIRST, DELETE ANY EXISTING INTEGRATIONS AND EVENTS FOR THIS USER
        await prisma.calendarIntegration.deleteMany({
            where: { userId }
        });

        await prisma.calendarEvent.deleteMany({
            where: { userId }
        });

        // THEN CREATE THE NEW ONE
        return await prisma.calendarIntegration.create({
            data: {
                id: `${userId}_${provider}`,
                userId,
                tenantId,
                provider,
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                tokenExpiry: expiry,
                calendarId: result.calendarId,
            },
        });
    }

    /**
     * Fetch events for a user/tenant, expanding recurring ones at runtime.
     */
    static async getEvents(userId: string, tenantId: string, startDate?: Date, endDate?: Date) {
        // Build the where condition dynamically
        let whereCondition: any = {
            userId,
            tenantId,
            isDeleted: false,
        };

        if (startDate || endDate) {
            // If date range is specified, filter by intersection OR include recurring events
            whereCondition.OR = [
                {
                    AND: [
                        startDate ? { endTime: { gt: startDate } } : {},
                        endDate ? { startTime: { lt: endDate } } : {},
                    ]
                },
                { isRecurring: true }
            ];
        }
        // If no date range specified, don't add OR condition - return all events

        const baseEvents = await prisma.calendarEvent.findMany({
            where: whereCondition,
            include: { exceptions: true },
            orderBy: { startTime: "asc" },
        });

        // 2. Expand recurring events and filter exceptions
        let allEvents: any[] = [];

        for (const event of baseEvents) {
            if (event.isRecurring && !event.externalId.includes('_occ_') && !event.externalId.includes('_RID')) {
                // Determine range for expansion (default to 60 days if not provided)
                const expansionStart = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                const expansionEnd = endDate || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

                const occurrences = this.expandRecurringEvent(event, expansionStart, expansionEnd);

                // Filter out cancelled occurrences AND occurrences that have specific override records in the DB
                const activeOccurrences = occurrences.map(occ => {
                    const occDateStr = new Date(occ.startTime).toISOString().split('T')[0];
                    const occTime = new Date(occ.startTime).getTime();

                    // 1. Check for exception record (cancellation or modification)
                    const exception = event.exceptions?.find((ex: any) => {
                        const exDateStr = new Date(ex.originalDate).toISOString().split('T')[0];
                        return exDateStr === occDateStr;
                    });

                    if (exception) {
                        const ex = exception as any;
                        if (ex.isCancelled && !ex.newStartTime) {
                            return null; // Truly cancelled
                        }

                        // Apply overrides
                        return {
                            ...occ,
                            title: ex.overrideTitle || occ.title,
                            description: ex.overrideDescription || occ.description,
                            location: ex.overrideLocation || occ.location,
                            meetingLink: ex.overrideMeetingLink || occ.meetingLink,
                            startTime: ex.newStartTime || occ.startTime,
                            endTime: ex.newEndTime || occ.endTime,
                            attendees: ex.overrideAttendees || occ.attendees,
                        };
                    }

                    // 2. Check if a "real" record exists for this occurrence (Legacy cleanup/support)
                    const realRecord = baseEvents.find(be => {
                        if (be.id === occ.id) return false;

                        // Case A: Literal master match
                        const isDirectMatch = be.externalId === event.externalId;
                        if (isDirectMatch) return false;

                        // Case B: Zoho _RID match (matches original date even if time changed)
                        if (be.externalId.includes('_RID')) {
                            const ridPart = be.externalId.split('_RID')[1].split('_')[0]; // yyyyMMddTHHmmssZ
                            try {
                                // Convert yyyyMMddTHHmmssZ to a comparable timestamp
                                const ridYear = ridPart.substring(0, 4);
                                const ridMonth = ridPart.substring(4, 6);
                                const ridDay = ridPart.substring(6, 8);
                                const ridDateStr = `${ridYear}-${ridMonth}-${ridDay}`;

                                const occDateStr = new Date(occ.startTime).toISOString().split('T')[0];
                                if (ridDateStr === occDateStr) {
                                    // Verify it's for the same master
                                    return be.externalId.startsWith(event.externalId);
                                }
                            } catch (e) { }
                        }

                        // Case C: Time-based match for other providers or _occ_
                        let isSameMaster = be.externalId === event.externalId ||
                            be.externalId.startsWith(event.externalId + '_occ_') ||
                            be.externalId.startsWith(event.externalId + '_RID');

                        if (!isSameMaster && be.rrule) {
                            try {
                                const parsed = JSON.parse(be.rrule);
                                if (parsed.seriesMasterId === event.externalId) isSameMaster = true;
                            } catch (e) { }
                        }

                        const beTime = new Date(be.startTime).getTime();
                        return isSameMaster && Math.abs(beTime - occTime) < 60000;
                    });

                    if (realRecord) {
                        return null;
                    }

                    return occ;
                }).filter(occ => occ !== null);

                // Determine true BYDAY for master filtering
                let trueByDay: string[] | null = null;
                let rruleToParse = this.extractTrueRrule(event.rrule);
                if (Array.isArray(rruleToParse)) {
                    rruleToParse = rruleToParse.join(" ");
                }
                if (rruleToParse && typeof rruleToParse === 'string' && rruleToParse.includes("BYDAY=")) {
                    const match = rruleToParse.match(/BYDAY=([^; ]+)/);
                    if (match) {
                        trueByDay = match[1].split(",").map(d => d.replace(/[^A-Z]/g, '').trim()).filter(d => !!d);
                    }
                }
                const dayToCodeForExpansion: { [key: number]: string } = {
                    0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA'
                };

                // 3. APPLY OVERLAYS TO MASTER
                const masterDateStr = new Date(event.startTime).toISOString().split('T')[0];
                const masterException = event.exceptions?.find((ex: any) => {
                    const exDateStr = new Date(ex.originalDate).toISOString().split('T')[0];
                    return exDateStr === masterDateStr;
                });

                // ALSO check if the master itself is cancelled (via exdate parsing)
                let masterIsCancelled = false;
                if (event.exdate && typeof event.exdate === 'string') {
                    const masterDateStr = new Date(event.startTime).toISOString().split("T")[0].replace(/-/g, "");
                    const excludedDates = event.exdate.split(/[;,]/).map((d: string) => d.trim().split("T")[0].replace(/-/g, ""));
                    if (excludedDates.includes(masterDateStr)) {
                        masterIsCancelled = true;
                    }
                }

                // AND check if the master's day actually matches the RRULE (e.g. series starts Sat but BYDAY=MO..FR)
                if (!masterIsCancelled && trueByDay) {
                    const masterDayCode = dayToCodeForExpansion[new Date(event.startTime).getUTCDay()];
                    if (!trueByDay.includes(masterDayCode)) {
                        masterIsCancelled = true;
                    }
                }

                if (masterException) {
                    if (masterException.isCancelled && !masterException.newStartTime) {
                        // master truly cancelled - skip pushing the master event
                    } else {
                        // Apply overrides to master
                        const mex = masterException as any;
                        allEvents.push({
                            ...event,
                            title: mex.overrideTitle || event.title,
                            description: mex.overrideDescription || event.description,
                            location: mex.overrideLocation || event.location,
                            meetingLink: mex.overrideMeetingLink || event.meetingLink,
                            startTime: mex.newStartTime || event.startTime,
                            endTime: mex.newEndTime || event.endTime,
                            attendees: mex.overrideAttendees || (event.attendees as any),
                        });
                    }
                } else if (!masterIsCancelled) {
                    allEvents.push(event);
                }

                // Deduplicate master from occurrences (since we expanded starting from master's day)
                const dedupedOccurrences = activeOccurrences.filter(occ => {
                    const occTime = new Date(occ.startTime).getTime();
                    const masterTime = new Date(event.startTime).getTime();
                    return Math.abs(occTime - masterTime) > 60000;
                });

                allEvents.push(...dedupedOccurrences);
            } else if (!event.externalId.includes('_occ_')) {
                // Standard non-recurring event
                allEvents.push(event);
            }
        }

        // Final sort and return
        return allEvents.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }

    /**
     * Get a valid access token for a user and provider, refreshing if necessary.
     */
    static async getValidAccessToken(userId: string, provider: CalendarProvider): Promise<{ accessToken: string, calendarId?: string }> {
        const integration = await prisma.calendarIntegration.findUnique({
            where: { userId_provider: { userId, provider } },
        });

        if (!integration || !integration.accessToken) {
            throw new Error(`${provider} integration not found`);
        }

        const fiveMinutes = 5 * 60 * 1000;
        if (integration.tokenExpiry && integration.tokenExpiry.getTime() - Date.now() > fiveMinutes) {
            return { accessToken: integration.accessToken, calendarId: integration.calendarId || undefined };
        }

        if (!integration.refreshToken) {
            throw new Error(`${provider} refresh token not found`);
        }

        const providerImpl = CalendarProviderFactory.getProvider(provider);
        const result = await providerImpl.refreshToken(integration.refreshToken);

        const expiry = new Date(Date.now() + result.expiresIn * 1000);

        await prisma.calendarIntegration.update({
            where: { id: integration.id },
            data: {
                accessToken: result.accessToken,
                tokenExpiry: expiry,
            },
        });

        return { accessToken: result.accessToken, calendarId: integration.calendarId || undefined };
    }

    /**
     * Sync events from the provider to the local database.
     * Always uses a date-range window to ensure cancelled/deleted occurrences are omitted.
     */
    static async syncEvents(userId: string, tenantId: string, provider: CalendarProvider, startDate?: Date, endDate?: Date) {
        const { accessToken, calendarId } = await this.getValidAccessToken(userId, provider);
        const providerImpl = CalendarProviderFactory.getProvider(provider);

        // Fetch events within the window (providers now return series masters + exceptions)
        const syncStart = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
        const syncEnd = endDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);     // 90 days ahead
        const rawExternalEvents = await providerImpl.getEvents(accessToken, calendarId, syncStart, syncEnd);

        // 0. Map events immediately so we work with the correct prefixed IDs
        const externalEvents = rawExternalEvents.map(e => providerImpl.mapToInternalEvent ? providerImpl.mapToInternalEvent(e) : {
            ...e,
            id: `${provider.toUpperCase()}_${e.id || e.uid || e.event_id}`,
            externalId: e.id || e.uid || e.event_id,
            provider
        });

        console.log(`[CalendarService] Syncing ${externalEvents.length} external events for ${provider}`);

        // 1. Identify valid external IDs for cleanup (using the RAW ID that matches our local 'externalId' column)
        const externalIds = externalEvents.map((e: any) => e.externalId).filter((id: any) => id != null);
        const sideSyncBuffer = new Date(Date.now() - 5 * 60 * 1000);

        // 2. CLEANUP: Delete stale local events in this window.
        // Also cleanup ANY legacy expansion rows (_occ_ suffix) since we multi-expanded them before.
        await prisma.calendarEvent.deleteMany({
            where: {
                userId,
                tenantId,
                provider: { in: [CalendarProvider.GOOGLE, CalendarProvider.MICROSOFT, CalendarProvider.ZOHO] },
                OR: [
                    {
                        AND: [
                            { externalId: { notIn: externalIds } },
                            { startTime: { gte: syncStart } },
                            { startTime: { lte: syncEnd } },
                            { isRecurring: false }
                        ]
                    },
                    {
                        AND: [
                            { externalId: { notIn: externalIds } },
                            { provider: CalendarProvider.ZOHO }
                        ]
                    },
                    { externalId: { contains: "_occ_" } } // PURGE LEGACY GENERATED ROWS
                ],
                NOT: { createdAt: { gte: sideSyncBuffer } } // Protect very fresh optimistic creations
            }
        });

        // 3. PROCESS SYNCED DATA
        for (const event of externalEvents) {
            let isCancelled = false;
            let isModifiedInstance = false;
            let masterExternalId = "";
            let originalDateStr = "";

            if (provider === CalendarProvider.GOOGLE) {
                isCancelled = event.status === 'cancelled' && !!event.recurringEventId;
                isModifiedInstance = !!event.recurringEventId && event.status !== 'cancelled';
                masterExternalId = event.recurringEventId;
                originalDateStr = event.originalStartTime?.dateTime || event.originalStartTime?.date;
            } else if (provider === CalendarProvider.MICROSOFT) {
                // MS types: singleInstance, occurrence, exception, seriesMaster
                isModifiedInstance = (event.type === 'occurrence' || event.type === 'exception');
                masterExternalId = event.seriesMasterId;
                originalDateStr = event.originalStartTime?.dateTime;
                // Microsoft cancellations are usually handled by absence from the list, 
                // but if it's an explicit "deleted" event in a sync feed (if we used delta links), we'd handle it here.
            } else if (provider === CalendarProvider.ZOHO) {
                const rid = event.recurrence_id || event.recurrenceid;
                const puid = event.parent_uid || event.parent_id;
                isModifiedInstance = !!(rid || puid) && event.estatus !== 'deleted';
                isCancelled = !!(rid || puid) && event.estatus === 'deleted';
                masterExternalId = puid;
                originalDateStr = rid; // Zoho's recurrence_id IS the original date string
            }

            if (isCancelled || isModifiedInstance) {
                console.log(`[CalendarService] ${provider} ${isCancelled ? 'cancellation' : 'modified instance'} detected for master ${masterExternalId} on ${originalDateStr}`);

                const master = await prisma.calendarEvent.findFirst({
                    where: { provider, externalId: masterExternalId, tenantId }
                });

                if (originalDateStr) {
                    const originalDate = this.parseZohoDate(originalDateStr);
                    originalDate.setUTCHours(0, 0, 0, 0);

                    if (isCancelled) {
                        await prisma.calendarEventException.upsert({
                            where: {
                                eventId_originalDate: {
                                    eventId: master?.id || `${provider}_${masterExternalId}_${tenantId}`,
                                    originalDate
                                }
                            },
                            create: {
                                eventId: master?.id || `${provider}_${masterExternalId}_${tenantId}`,
                                tenantId,
                                userId,
                                originalDate,
                                createdById: userId,
                                isCancelled: true
                            },
                            update: { isCancelled: true } as any
                        });
                    } else {
                        // MODIFIED INSTANCE
                        if (master) {
                            const mapped = this.mapToCalendarEvent(event, provider, userId, tenantId);
                            const exData: any = {
                                eventId: master.id,
                                tenantId,
                                userId,
                                originalDate,
                                isCancelled: false,
                                overrideTitle: mapped.title,
                                overrideDescription: mapped.description,
                                overrideLocation: mapped.location,
                                overrideMeetingLink: mapped.meetingLink,
                                overrideAttendees: mapped.attendees || undefined,
                                newStartTime: mapped.startTime,
                                newEndTime: mapped.endTime,
                                createdById: userId,
                                updatedById: userId,
                                externalInstanceId: event.id || event.uid || event.event_id
                            };
                            await prisma.calendarEventException.upsert({
                                where: {
                                    eventId_originalDate: {
                                        eventId: master.id,
                                        originalDate
                                    }
                                },
                                create: exData,
                                update: exData
                            });
                        } else {
                            // Master not found yet — fall back to a normal upsert
                            const mapped = this.mapToCalendarEvent(event, provider, userId, tenantId);
                            const existingEvent = await prisma.calendarEvent.findFirst({
                                where: { provider, externalId: mapped.externalId, tenantId }
                            });

                            const finalCalendar = existingEvent ? (existingEvent.calendar || mapped.calendar) : (mapped.calendar || "Personal Calendar");
                            const finalSourceType = existingEvent ? (existingEvent.sourceType || mapped.sourceType) : (mapped.sourceType || "Manual");

                            const upsertData = { ...mapped, calendar: finalCalendar, sourceType: finalSourceType };

                            await prisma.calendarEvent.upsert({
                                where: { provider_externalId_tenantId: { provider, externalId: mapped.externalId, tenantId } },
                                create: upsertData,
                                update: upsertData,
                            });
                        }
                    }
                }
            } else {
                // NORMAL EVENT OR MASTER SERIES — standard upsert
                const mapped = this.mapToCalendarEvent(event, provider, userId, tenantId);

                const existingEvent = await prisma.calendarEvent.findFirst({
                    where: { provider, externalId: mapped.externalId, tenantId }
                });

                const finalCalendar = existingEvent ? (existingEvent.calendar || mapped.calendar) : (mapped.calendar || "Personal Calendar");
                const finalSourceType = existingEvent ? (existingEvent.sourceType || mapped.sourceType) : (mapped.sourceType || "Manual");

                const upsertData = { ...mapped, calendar: finalCalendar, sourceType: finalSourceType };

                await prisma.calendarEvent.upsert({
                    where: { provider_externalId_tenantId: { provider, externalId: mapped.externalId, tenantId } },
                    create: upsertData,
                    update: upsertData,
                });

                // ZOHO EXCEPTION POPULATION: If Zoho has exdate, create dedicated exception records
                if (provider === CalendarProvider.ZOHO && event.exdate && typeof event.exdate === 'string') {
                    const exDates = event.exdate.split(/[;,]/);
                    console.log(`[CalendarService] Parsing Zoho exdate: "${event.exdate}" for event ${mapped.id}`);
                    for (const exDateStr of exDates) {
                        const trimmed = exDateStr.trim();
                        if (trimmed) {
                            // Zoho format: 20260303 or 20260303T123456Z
                            let year, month, day;
                            if (trimmed.includes("-")) {
                                const parts = trimmed.split("T")[0].split("-");
                                year = parseInt(parts[0]);
                                month = parseInt(parts[1]) - 1;
                                day = parseInt(parts[2]);
                            } else {
                                year = parseInt(trimmed.substring(0, 4));
                                month = parseInt(trimmed.substring(4, 6)) - 1;
                                day = parseInt(trimmed.substring(6, 8));
                            }

                            if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                                const originalDate = new Date(Date.UTC(year, month, day, 0, 0, 0));
                                console.log(`[CalendarService] Creating Zoho exception record for ${mapped.id} on ${originalDate.toISOString()}`);
                                await prisma.calendarEventException.upsert({
                                    where: {
                                        eventId_originalDate: {
                                            eventId: mapped.id,
                                            originalDate
                                        }
                                    },
                                    create: {
                                        eventId: mapped.id,
                                        tenantId,
                                        userId,
                                        originalDate,
                                        isCancelled: true,
                                        createdById: userId,
                                    },
                                    update: { isCancelled: true } as any
                                });
                            }
                        }
                    }
                }
            }
        }
        return externalEvents.length;
    }

    /**
     * Create an event on the external provider and save locally.
     */
    // static async createEvent(userId: string, tenantId: string, provider: CalendarProvider, eventData: CalendarEventData) {
    //     const { accessToken, calendarId } = await this.getValidAccessToken(userId, provider);
    //     if (!calendarId) throw new Error(`Primary calendar ID not found for ${provider}`);

    //     const providerImpl = CalendarProviderFactory.getProvider(provider);
    //     const externalEvent = await providerImpl.createEvent(accessToken, calendarId, eventData);

    //     const mapped = this.mapToCalendarEvent(externalEvent, provider, userId, tenantId);
    //     return await prisma.calendarEvent.upsert({
    //         where: { provider_externalId_tenantId: { provider, externalId: mapped.externalId, tenantId } },
    //         create: mapped,
    //         update: mapped,
    //     });
    // }

    /**
     * Check for any overlapping events for a specific user and time range.
     */
    static async checkForOverlap(userId: string, tenantId: string, startTime: Date | string, endTime: Date | string, excludeEventId?: string) {
        const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
        const end = typeof endTime === 'string' ? new Date(endTime) : endTime;

        // Expand window slightly to catch boundary overlaps
        const bufferStart = new Date(start.getTime() - 1000);
        const bufferEnd = new Date(end.getTime() + 1000);

        // 1. Get all events for the user in this window (includes expanded recurring events)
        const events = await this.getEvents(userId, tenantId, bufferStart, bufferEnd);

        // 2. Filter for actual overlaps, excluding the event itself (if editing)
        const overlaps = events.filter(event => {
            // Skip the event being edited
            if (excludeEventId && (event.id === excludeEventId || event.externalId === excludeEventId)) {
                return false;
            }

            const estart = new Date(event.startTime);
            const eend = new Date(event.endTime);

            // Timestamp intersection check: (S1 < E2) && (E1 > S2)
            const isOverlapping = (estart < endTime) && (eend > startTime);
            return isOverlapping;
        });

        return overlaps;
    }

    static async createEvent(userId: string, tenantId: string, provider: CalendarProvider, eventData: CalendarEventData) {
        console.log("🟡🟡🟡 BACKEND SERVICE - CREATE EVENT START 🟡🟡🟡");
        
        // --- STRICT OVERLAP ENFORCEMENT ---
        const overlaps = await this.checkForOverlap(userId, tenantId, new Date(eventData.startTime), new Date(eventData.endTime));
        if (overlaps.length > 0) {
            throw new Error(`STRICT_OVERLAP_CONFLICT: ${overlaps.length} existing event(s) overlap with this time slot. Double-booking is not allowed.`);
        }

        console.log("🟡 userId:", userId);
        console.log("🟡 provider:", provider);
        console.log("🟡 eventData:", JSON.stringify(eventData, null, 2));
        console.log("🟡 generateMeeting:", eventData.generateMeeting);

        const { accessToken, calendarId } = await this.getValidAccessToken(userId, provider);
        if (!calendarId) throw new Error(`Primary calendar ID not found for ${provider}`);

        if (provider === "MICROSOFT") {
            try {
                const calResponse = await axios.get("https://graph.microsoft.com/v1.0/me/calendar", {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                console.log("🟡 MS Calendar Settings:", JSON.stringify({
                    allowedOnlineMeetingProviders: calResponse.data.allowedOnlineMeetingProviders,
                    defaultOnlineMeetingProvider: calResponse.data.defaultOnlineMeetingProvider,
                    isDefaultCalendar: calResponse.data.isDefaultCalendar
                }));
            } catch (err) {
                console.error("error fetching MS calendar settings:", err);
            }
        }

        const providerImpl = CalendarProviderFactory.getProvider(provider);

        // Ensure dates are Date objects
        const processedEventData = {
            ...eventData,
            startTime: typeof eventData.startTime === 'string' ? new Date(eventData.startTime) : eventData.startTime,
            endTime: typeof eventData.endTime === 'string' ? new Date(eventData.endTime) : eventData.endTime,
        };

        console.log("🟡 Processed eventData:", JSON.stringify(processedEventData, null, 2));
        console.log("🟡 Calling providerImpl.createEvent with generateMeeting:", processedEventData.generateMeeting);

        const externalEvent = await providerImpl.createEvent(accessToken, calendarId, processedEventData);

        console.log("🟡 External event response ID:", externalEvent.id);
        console.log("🟡 External event raw response (partial):", JSON.stringify({
            onlineMeeting: externalEvent.onlineMeeting,
            onlineMeetingUrl: externalEvent.onlineMeetingUrl,
            hasBody: !!externalEvent.body?.content,
            bodyLength: externalEvent.body?.content?.length || 0
        }));

        if (externalEvent.body?.content) {
            console.log("🟡 External event BODY CONTENT:", externalEvent.body.content);
        }

        const meetingLink = externalEvent.onlineMeeting?.joinUrl || externalEvent.onlineMeetingUrl || externalEvent.hangoutLink;
        console.log("🟡 External event meeting link (direct property):", meetingLink);

        const mapped = this.mapToCalendarEvent(externalEvent, provider, userId, tenantId);
        mapped.calendar = eventData.calendar || "Personal Calendar";
        mapped.sourceType = eventData.sourceType || "Manual";
        console.log("🟡 Mapped event:", JSON.stringify(mapped, null, 2));
        console.log("🟡🟡🟡 BACKEND SERVICE - CREATE EVENT END 🟡🟡🟡");

        const result = await prisma.calendarEvent.upsert({
            where: { provider_externalId_tenantId: { provider, externalId: mapped.externalId, tenantId } },
            create: mapped,
            update: mapped,
        });

        return result;
    }

    private static expandRecurringEvent(master: any, startLimit: Date, endLimit: Date): any[] {
        const occurrences: any[] = [];
        const masterStart = new Date(master.startTime);
        const masterEnd = new Date(master.endTime);
        const duration = masterEnd.getTime() - masterStart.getTime();

        // Support BYDAY in rrule (e.g. FREQ=WEEKLY;BYDAY=MO,TU,WE)
        let byDay: string[] | null = null;
        let trueRrule = this.extractTrueRrule(master.rrule);

        // Google returns recurrence as an array of strings
        if (Array.isArray(trueRrule)) {
            trueRrule = trueRrule.join(" ");
        }

        if (trueRrule && typeof trueRrule === 'string') {
            if (trueRrule.includes("BYDAY=")) {
                const match = trueRrule.match(/BYDAY=([^; ]+)/);
                if (match) {
                    // Sanitize: strip common garbage characters from JSON/string wraps
                    byDay = match[1].split(",").map(d => d.replace(/[^A-Z]/g, '').trim()).filter(d => !!d);
                }
            } else if (trueRrule.startsWith("{")) {
                // Microsoft JSON format
                try {
                    const parsed = JSON.parse(trueRrule);
                    const days = parsed.pattern?.daysOfWeek || [];
                    const msDayToCode: { [key: string]: string } = {
                        'sunday': 'SU', 'monday': 'MO', 'tuesday': 'TU', 'wednesday': 'WE',
                        'thursday': 'TH', 'friday': 'FR', 'saturday': 'SA'
                    };
                    byDay = days.map((d: string) => msDayToCode[d.toLowerCase()]).filter((d: string) => !!d);
                } catch (e) {
                    console.error("[CalendarService] Failed to parse MS recurrence JSON during expansion:", e);
                }
            }
        }

        const dayToCode: { [key: number]: string } = {
            0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA'
        };

        let current = new Date(masterStart);
        // Start from the same day as master (getEvents will handle deduplication)
        current.setUTCHours(0, 0, 0, 0);

        // Limit expansion to prevent infinite loops (max 1 year)
        const maxDate = new Date(masterStart);
        maxDate.setUTCDate(maxDate.getUTCDate() + 365);

        // Adjust endLimit to ensure we capture the full day if it's the boundary
        const adjustedEndLimit = new Date(endLimit);
        adjustedEndLimit.setUTCHours(23, 59, 59, 999);

        const actualEndLimit = adjustedEndLimit < maxDate ? adjustedEndLimit : maxDate;

        // Parse exdate (exceptions) if present. Zoho uses strings like "20260303,20260304"
        const excludedDates = new Set<string>();
        if (master.exdate) {
            const dates = master.exdate.split(/[;,]/);
            for (const d of dates) {
                const trimmed = d.trim();
                if (trimmed) {
                    // Normalize to YYYYMMDD for easy comparison
                    if (trimmed.includes("-")) {
                        excludedDates.add(trimmed.replace(/-/g, "").split("T")[0]);
                    } else {
                        excludedDates.add(trimmed.split("T")[0]);
                    }
                }
            }
        }

        while (current <= actualEndLimit) {
            // Respect BYDAY if present
            if (byDay) {
                const dayCode = dayToCode[current.getUTCDay()];
                if (!byDay.includes(dayCode)) {
                    current.setUTCDate(current.getUTCDate() + 1);
                    continue;
                }
            }
            const currentDateStr = current.toISOString().split("T")[0].replace(/-/g, "");
            if (excludedDates.has(currentDateStr)) {
                current.setUTCDate(current.getUTCDate() + 1);
                continue;
            }

            const occStart = new Date(current);
            occStart.setUTCHours(masterStart.getUTCHours(), masterStart.getUTCMinutes(), masterStart.getUTCSeconds(), masterStart.getUTCMilliseconds());

            const occEnd = new Date(occStart.getTime() + duration);

            occurrences.push({
                ...master,
                id: `${master.id}_occ_${current.getTime()}`,
                externalId: `${master.externalId}_occ_${current.getTime()}`,
                startTime: occStart,
                endTime: occEnd,
                rrule: JSON.stringify({ seriesMasterId: master.externalId, originalRrule: master.rrule }),
                exceptions: [], // Occurrences don't have their own exceptions
            });

            // Move to next day (DAILY)
            current.setUTCDate(current.getUTCDate() + 1);
        }

        return occurrences;
    }

    /**
     * Update an event on the external provider and save locally.
     */
    static async updateEvent(userId: string, tenantId: string, provider: CalendarProvider, externalId: string, eventData: CalendarEventData, action?: number, occurrenceDate?: string, userEmail?: string) {
        // --- STRICT OVERLAP ENFORCEMENT ---
        const overlaps = await this.checkForOverlap(userId, tenantId, new Date(eventData.startTime), new Date(eventData.endTime), externalId);
        if (overlaps.length > 0) {
            throw new Error(`STRICT_OVERLAP_CONFLICT: ${overlaps.length} existing event(s) overlap with this time slot. Double-booking is not allowed.`);
        }

        const { accessToken, calendarId } = await this.getValidAccessToken(userId, provider);
        if (!calendarId) throw new Error(`Primary calendar ID not found for ${provider}`);

        // 1. Resolve master ID
        let masterExternalId = this.resolveMasterExternalId(externalId);
        const isOptimistic = externalId.includes('_occ_');
        const isForked = externalId.includes('_RID') || (provider === CalendarProvider.GOOGLE && externalId.includes('_'));

        const localEvent = await prisma.calendarEvent.findUnique({
            where: { provider_externalId_tenantId: { provider, externalId: masterExternalId, tenantId } }
        });

        if (!localEvent) throw new Error("Event not found locally.");

        // 2. Ownership check 
        console.log(`[CalendarService] Ownership check: userId=${userId}, localEvent.userId=${localEvent.userId}, userEmail=${userEmail}, organizerEmail=${localEvent.organizerEmail}`);

        if (userEmail && localEvent.organizerEmail) {
            const isSameUser = localEvent.userId === userId;
            const isSameEmail = localEvent.organizerEmail.toLowerCase() === userEmail.toLowerCase();

            if (!isSameUser && !isSameEmail) {
                console.warn(`[CalendarService] Ownership check FAILED: User ${userEmail} (${userId}) attempted to update event hosted by ${localEvent.organizerEmail} (${localEvent.userId})`);
                throw new Error("Only the host can update this event");
            }
            console.log(`[CalendarService] Ownership check passed: isSameUser=${isSameUser}, isSameEmail=${isSameEmail}`);
        }

        // If it's Microsoft and we don't have a generateMeeting flag, check if the local event had a link
        // to prevent accidental wipe during update.
        if (provider === CalendarProvider.MICROSOFT && eventData.generateMeeting === undefined) {
            if (localEvent?.meetingLink) {
                eventData.generateMeeting = true;
            }
        }

        // 3. Determine target ID for provider
        // For Google/Microsoft single-occurrence actions, we MUST target the master ID 
        // because the provider implementation uses the master ID to list instances and find the correct one.
        // If we target a forked ID directly, the /instances call will 404.
        let targetExternalId = (isOptimistic || isForked || action === 0 || action === 1 || action === 2) ? masterExternalId : externalId;

        const providerImpl = CalendarProviderFactory.getProvider(provider);
        const externalEvent = await providerImpl.updateEvent(accessToken, calendarId, targetExternalId, { ...eventData, existingMeetingLink: localEvent.meetingLink }, action, occurrenceDate);

        const masterRrule = this.extractTrueRrule(localEvent?.rrule || null);
        const mapped = this.mapToCalendarEvent(externalEvent, provider, userId, tenantId, masterRrule);
        mapped.calendar = eventData.calendar || localEvent.calendar || "Personal Calendar";
        mapped.sourceType = eventData.sourceType || localEvent.sourceType || "Manual";

        // EXTRA SECURITY: If the provider response is missing the meeting link,
        // but the record we sent was supposed to be a meeting, preserve the existing link.
        if (provider === CalendarProvider.MICROSOFT && !mapped.meetingLink) {
            if (localEvent?.meetingLink) {
                mapped.meetingLink = localEvent.meetingLink;
            }
        }

        // When updating a single instance (action === 0), providers (Google, MS, Zoho) often 
        // "fork" the occurrence and return a brand-new event ID. If we blindly upsert that new ID,
        // we create a duplicate row alongside the original master. Instead, we:
        // 1. Mark an exception on the MASTER series with all the overrides.
        // 2. Return a "virtual" occurrence so the UI updates correctly without shifting.
        let result;
        if (action === 0) {
            // For single-occurrence update, save to exception table
            if (occurrenceDate) {
                const originalDate = new Date(occurrenceDate);
                originalDate.setUTCHours(0, 0, 0, 0);

                const exData: any = {
                    eventId: localEvent.id,
                    tenantId,
                    userId,
                    originalDate,
                    isCancelled: false,
                    overrideTitle: mapped.title,
                    overrideDescription: mapped.description,
                    overrideLocation: mapped.location,
                    overrideMeetingLink: mapped.meetingLink,
                    overrideAttendees: mapped.attendees || undefined,
                    newStartTime: mapped.startTime,
                    newEndTime: mapped.endTime,
                    createdById: userId,
                    updatedById: userId,
                    externalInstanceId: mapped.externalId
                };

                await prisma.calendarEventException.upsert({
                    where: {
                        eventId_originalDate: {
                            eventId: localEvent.id,
                            originalDate
                        }
                    },
                    create: exData,
                    update: exData
                });
                console.log(`[CalendarService] action=0 ${provider}: Saved overrides to exception for master ${masterExternalId} on ${originalDate.toISOString()}`);

                // Return the VIRTUAL occurrence so the UI updates correctly without shifting
                // If the provider returned a series master (likely for Zoho/Google), mapped.startTime might be the series start.
                // We use the intended startTime/endTime from the payload if they are valid dates, otherwise preserve mapped.
                let finalStartTime = mapped.startTime;
                let finalEndTime = mapped.endTime;

                // Heuristic: If mapped startTime is on a different day than the occurrenceDate (and it's not a timezone edge case),
                // it's likely a series master start time.
                const intendedDate = new Date(occurrenceDate);
                const mappedDate = new Date(mapped.startTime);

                // Compare YYYY-MM-DD to be timezone-safe for local "shifting" detection
                const intendedISO = intendedDate.toISOString().split('T')[0];
                const mappedISO = mappedDate.toISOString().split('T')[0];

                if (intendedISO !== mappedISO && !mapped.isAllDay) {
                    console.log(`[CalendarService] Detected series master return (${mappedISO}) for occurrence update (${intendedISO}). Reconstructing correct occurrence timing...`);
                    // Try to use the eventData times if provided and valid
                    if (eventData.startTime) {
                        finalStartTime = typeof eventData.startTime === 'string' ? new Date(eventData.startTime) : eventData.startTime;
                    }
                    if (eventData.endTime) {
                        finalEndTime = typeof eventData.endTime === 'string' ? new Date(eventData.endTime) : eventData.endTime;
                    }
                }

                result = {
                    ...localEvent,
                    id: localEvent.id,
                    externalId: mapped.externalId,
                    title: mapped.title,
                    description: mapped.description,
                    location: mapped.location,
                    startTime: finalStartTime,
                    endTime: finalEndTime,
                    meetingLink: mapped.meetingLink,
                    attendees: mapped.attendees,
                    isRecurring: true,
                    rrule: JSON.stringify({ seriesMasterId: localEvent.externalId, originalRrule: localEvent.rrule })
                };
            } else {
                result = localEvent;
            }
        } else {
            // For all-series or all-future updates, upsert on the ID returned by the provider.
            result = await prisma.calendarEvent.upsert({
                where: { provider_externalId_tenantId: { provider, externalId: mapped.externalId, tenantId } },
                update: mapped,
                create: mapped,
            });

            if (action !== 0 && targetExternalId !== mapped.externalId) {
                try {
                    await prisma.calendarEvent.delete({
                        where: { provider_externalId_tenantId: { provider, externalId: targetExternalId, tenantId } }
                    });
                } catch (err) {
                    // Ignore if record didn't exist
                }
            }
        }

        return result;
    }

    /**
     * Delete an event from the external provider and local database.
     */
    static async deleteEvent(userId: string, tenantId: string, provider: CalendarProvider, externalId: string, action?: number, occurrenceDate?: string, userEmail?: string) {
        const { accessToken, calendarId } = await this.getValidAccessToken(userId, provider);
        if (!calendarId) throw new Error(`Primary calendar ID not found for ${provider}`);

        const providerImpl = CalendarProviderFactory.getProvider(provider);

        // 1. Resolve the true Master External ID
        let masterExternalId = this.resolveMasterExternalId(externalId);
        const isOptimistic = externalId.includes('_occ_');
        const isForked = externalId.includes('_RID');

        // 2. Fetch the event locally to find its series master
        const localEvent = await prisma.calendarEvent.findUnique({
            where: { provider_externalId_tenantId: { provider, externalId: masterExternalId, tenantId } }
        });

        if (!localEvent) throw new Error("Event not found locally.");

        if (localEvent?.rrule && !isOptimistic) {
            try {
                const parsed = JSON.parse(localEvent.rrule);
                if (parsed.seriesMasterId) {
                    masterExternalId = parsed.seriesMasterId;
                }
            } catch (e) {
                // Not JSON, ignore
            }
        }

        // 3. Ownership Check: Only the host (organizer) should be allowed to delete the event.
        if (userEmail && localEvent.organizerEmail && localEvent.organizerEmail.toLowerCase() !== userEmail.toLowerCase()) {
            console.warn(`[CalendarService] User ${userEmail} attempted to delete event hosted by ${localEvent.organizerEmail}`);
            throw new Error("Only the host can delete this event");
        }

        // 4. Determine the target for the provider deletion
        // Always target the master ID if we're working with an optimistic/forked occurrence
        // or if explicitly deleting the whole series or a single day.
        let targetExternalId = (isOptimistic || isForked || action === 0 || action === 1 || action === 2) ? masterExternalId : externalId;

        // 4. Delete on the external provider (handle all actions including single occurrences)
        await providerImpl.deleteEvent(accessToken, calendarId, targetExternalId, action, occurrenceDate);

        // 5. Local database cleanup
        
        // Handle single occurrence deletion (action === 0) with occurrenceDate
        if (action === 0 && occurrenceDate && occurrenceDate !== null && occurrenceDate !== undefined) {
            // 5a. Find the true Master record to add the exception
            const masterRecord = await prisma.calendarEvent.findUnique({
                where: { provider_externalId_tenantId: { provider, externalId: masterExternalId, tenantId } }
            });

            if (masterRecord) {
                const originalDate = new Date(occurrenceDate);
                originalDate.setUTCHours(0, 0, 0, 0);

                try {
                    await prisma.calendarEventException.upsert({
                        where: {
                            eventId_originalDate: {
                                eventId: masterRecord.id,
                                originalDate
                            }
                        },
                        create: {
                            eventId: masterRecord.id,
                            tenantId,
                            userId,
                            originalDate,
                            isCancelled: true,
                            createdById: userId,
                        } as any,
                        update: { isCancelled: true } as any
                    });
                } catch (e) {
                    console.error(`[CalendarService] Failed to create exception on master ${masterExternalId}:`, e);
                }
            }

            // 5b. If this was a standalone record (forked occurrence), delete it as well
            // We use deleteMany to catch variations with _occ_ suffix
            if (externalId !== masterExternalId) {
                const baseForkedId = externalId.split('_occ_')[0];
                await prisma.calendarEvent.deleteMany({
                    where: {
                        userId,
                        tenantId,
                        provider,
                        externalId: { startsWith: baseForkedId }
                    }
                }).catch(() => { });
            }

            return; // Don't proceed to master deletion
        }

        // Handle single events (action === undefined or null) - delete directly
        if (!action || action === undefined || action === null) {
            // Check if this is a single (non-recurring) event
            const eventToDelete = await prisma.calendarEvent.findFirst({
                where: {
                    userId,
                    tenantId,
                    provider,
                    externalId: targetExternalId
                }
            });

            if (eventToDelete) {
                if (!eventToDelete.isRecurring) {
                    // Single event - delete it directly
                    try {
                        await prisma.calendarEvent.delete({
                            where: { id: eventToDelete.id }
                        });
                        return;
                    } catch (deleteError) {
                        console.error(`[CalendarService] Failed to delete single event from database:`, deleteError);
                        throw deleteError;
                    }
                } else {
                    // Recurring event - proceed with master deletion logic
                }
            }
        }

        // Handle delete entire series (action === 2) - delete master and all occurrences
        if (action === 2) {
            // Find the master event
            const masterEvent = await prisma.calendarEvent.findFirst({
                where: {
                    userId,
                    tenantId,
                    provider,
                    externalId: targetExternalId
                }
            });

            if (masterEvent) {
                if (masterEvent.isRecurring) {
                    // Delete entire series - master event and all related occurrences
                    try {
                        // Delete all occurrences with the same base externalId
                        const baseExternalId = masterEvent.externalId.split('_occ_')[0].split('_RID')[0];
                        
                        // Delete all forked occurrences
                        await prisma.calendarEvent.deleteMany({
                            where: {
                                userId,
                                tenantId,
                                provider,
                                externalId: { startsWith: baseExternalId }
                            }
                        });
                        
                        return;
                    } catch (deleteError) {
                        console.error(`[CalendarService] Failed to delete entire recurring series from database:`, deleteError);
                        throw deleteError;
                    }
                } else {
                    // Not a recurring event, delete it directly
                    try {
                        await prisma.calendarEvent.delete({
                            where: { id: masterEvent.id }
                        });
                        return;
                    } catch (deleteError) {
                        console.error(`[CalendarService] Failed to delete event from database:`, deleteError);
                        throw deleteError;
                    }
                }
            }
        }
    }

    private static resolveMasterExternalId(id: string): string {
        if (!id) return "";

        let externalId = id;

        // 1. Strip internal prefixes recursively (e.g. MICROSOFT_MICROSOFT_ -> MICROSOFT_)
        const internalPrefixRegex = /^(GOOGLE|ZOHO|MICROSOFT)_/i;
        while (internalPrefixRegex.test(externalId)) {
            externalId = externalId.replace(internalPrefixRegex, "");
        }

        // 2. Remove tenant suffix if it's a UUID
        const parts = externalId.split('_');
        if (parts.length >= 2) {
            const lastPart = parts[parts.length - 1];
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (lastPart.length === 36 && uuidRegex.test(lastPart)) {
                externalId = parts.slice(0, -1).join('_');
            }
        }

        // 3. Keep forked RID/occ if explicitly needed, but for Master resolution, strip them
        // Note: We only strip if it's a known internal suffix pattern.
        if (externalId.includes('_occ_')) {
            externalId = externalId.split('_occ_')[0];
        } else if (externalId.includes('_RID')) {
            externalId = externalId.split('_RID')[0];
        }

        return externalId;
    }

    private static extractTrueRrule(rrule: string | null): string | null {
        if (!rrule) return null;
        try {
            let current = rrule;
            let iterations = 0;
            // Recursively unwrap if it's a JSON string of a string or array
            while (iterations < 5) {
                try {
                    const parsed = JSON.parse(current);
                    if (parsed && typeof parsed === 'object' && parsed.originalRrule) {
                        current = parsed.originalRrule;
                        break;
                    }
                    if (typeof parsed === 'string') {
                        current = parsed;
                        iterations++;
                        continue;
                    }
                    break;
                } catch (e) {
                    break;
                }
            }
            return current;
        } catch (e) {
            return rrule;
        }
    }

    /**
     * Map provider-specific event data to the common CalendarEvent model.
     */
    private static mapToCalendarEvent(externalEvent: any, provider: CalendarProvider, userId: string, tenantId: string, masterRrule?: string | null) {
        if (provider === CalendarProvider.ZOHO) {
            const rid = externalEvent.recurrence_id || externalEvent.recurrenceid;
            let uid = externalEvent.uid || externalEvent.event_id;
            const isOccurrence = !!(rid || externalEvent.parent_uid);
            const isMaster = !!externalEvent.rrule && !isOccurrence;

            // For Zoho, if it's an occurrence, try to find the master ID
            const seriesMasterId = externalEvent.parent_uid || externalEvent.parent_id || null;

            // Suffix with occurrence ID if it's a Zoho occurrence to avoid master record overwrite
            const externalId = (isOccurrence && rid) ? `${uid}_RID${rid}` : uid;

            return {
                id: `${provider}_${externalId}_${tenantId}`,
                provider,
                externalId: externalId,
                tenantId,
                userId,
                title: externalEvent.title || "Untitled",
                description: externalEvent.description || null,
                location: externalEvent.location || null,
                startTime: this.parseZohoDate(externalEvent.dateandtime?.start || externalEvent.startdatetime),
                endTime: this.parseZohoDate(externalEvent.dateandtime?.end || externalEvent.enddatetime),
                isAllDay: !!externalEvent.isallday,
                isRecurring: !!(externalEvent.rrule || externalEvent.isrep || isOccurrence),
                rrule: isMaster ? externalEvent.rrule : (isOccurrence ? JSON.stringify({ seriesMasterId: seriesMasterId || uid, originalRrule: masterRrule || externalEvent.rrule }) : (externalEvent.rrule || masterRrule || null)),
                exdate: externalEvent.exdate || null,
                calendar: externalEvent.calendar || null,
                sourceType: externalEvent.source_type || externalEvent.sourceType || null,
                meetingLink: externalEvent.conference_data?.meetingdata?.meeting_link ||
                    externalEvent.app_data?.meetingdata?.meetinglink || (externalEvent as any).meetingLink || null,
                attendees: externalEvent.attendees?.map((a: any) => a.email || a) || null,
                organizerEmail: externalEvent.organizer_email || externalEvent.organizer || null,
                isDeleted: externalEvent.estatus === 'deleted'
            };
        }
        else if (provider === CalendarProvider.GOOGLE) {
            const isOccurrence = !!externalEvent.recurringEventId;
            const isMaster = !!externalEvent.recurrence;
            const isRecurringEvent = isMaster || isOccurrence;

            return {
                id: `${provider}_${externalEvent.id}_${tenantId}`,
                provider,
                externalId: externalEvent.id,
                tenantId,
                userId,
                title: externalEvent.summary || "Untitled",
                description: externalEvent.description || null,
                location: externalEvent.location || null,
                startTime: new Date(externalEvent.start.dateTime || externalEvent.start.date),
                endTime: new Date(externalEvent.end.dateTime || externalEvent.end.date),
                isAllDay: !!externalEvent.start.date,
                isRecurring: isRecurringEvent,
                // Store recurrence pattern if master, or master ID if occurrence
                rrule: isMaster ? JSON.stringify(externalEvent.recurrence) : (isOccurrence ? JSON.stringify({ seriesMasterId: externalEvent.recurringEventId, originalRrule: masterRrule }) : (masterRrule ? JSON.stringify({ originalRrule: masterRrule }) : null)),
                meetingLink: externalEvent.hangoutLink || null,
                attendees: externalEvent.attendees?.map((a: any) => a.email || a) || null,
                organizerEmail: (externalEvent.organizer?.email || externalEvent.creator?.email || null),
                isDeleted: externalEvent.status === 'cancelled'
            };
        } else if (provider === CalendarProvider.MICROSOFT) {
            const body = externalEvent.body?.content || "";
            let meetingLink = externalEvent.onlineMeeting?.joinUrl || externalEvent.onlineMeetingUrl || null;

            // Fallback: If link is null but exists in body (common for personal accounts and some recurring series)
            if (!meetingLink && body) {
                // Look for Teams or Skype links in the HTML body with more robust regexes
                // These regexes now handle potential HTML encoding or trailing noise better
                const teamsBusinessMatch = body.match(/https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^"'\s<>#]+(?=\?|#|["'\s<>])?/);
                if (!teamsBusinessMatch) {
                    // Fallback for simple link without query params or with standard ones
                    const backupTeamsBusiness = body.match(/https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^"'\s<>]+/);
                    if (backupTeamsBusiness) meetingLink = backupTeamsBusiness[0];
                } else {
                    meetingLink = teamsBusinessMatch[0];
                }

                if (!meetingLink) {
                    const teamsPersonalMatch = body.match(/https:\/\/teams\.live\.com\/meet\/[^"'\s<>]+/);
                    const skypeMatch = body.match(/https:\/\/join\.skype\.com\/[^"'\s<>]+/);
                    meetingLink = teamsPersonalMatch?.[0] || skypeMatch?.[0] || null;
                }
            }

            const msType = externalEvent.type; // 'singleInstance' | 'occurrence' | 'exception' | 'seriesMaster'
            const isRecurringEvent = msType === 'seriesMaster' || msType === 'occurrence' || msType === 'exception' || !!externalEvent.recurrence;

            // Convert Microsoft JSON recurrence to standard RRULE string for frontend display
            let rruleStr = null;
            if (externalEvent.recurrence) {
                rruleStr = this.microsoftRecurrenceToRRule(externalEvent.recurrence);
            } else if (externalEvent.seriesMasterId) {
                rruleStr = JSON.stringify({ seriesMasterId: externalEvent.seriesMasterId, originalRrule: masterRrule });
            } else if (masterRrule) {
                rruleStr = JSON.stringify({ originalRrule: masterRrule });
            }

            // If it's a delta update and subject is strictly undefined, we'll let handleSyncResult preserve the old one.
            // But if it's explicitly null or empty, it gets "Untitled".
            let rawTitle = externalEvent.subject;
            if (rawTitle === null || rawTitle === "") {
                rawTitle = "Untitled";
            } else if (rawTitle === undefined) {
                rawTitle = externalEvent['@removed'] ? "Deleted Event" : "Untitled"; // Fallback if handleSyncResult has no old title
            }

            return {
                id: `${provider}_${externalEvent.id}_${tenantId}`,
                provider,
                externalId: externalEvent.id,
                tenantId,
                userId,
                title: rawTitle,
                description: this.cleanMicrosoftBody(body) || null,
                location: externalEvent.location?.displayName || null,
                startTime: this.parseMicrosoftDate(externalEvent.start),
                endTime: this.parseMicrosoftDate(externalEvent.end),
                isAllDay: !!externalEvent.isAllDay,
                isRecurring: isRecurringEvent,
                rrule: rruleStr,
                meetingLink,
                attendees: externalEvent.attendees?.map((a: any) => a.emailAddress?.address || a) || null,
                organizerEmail: externalEvent.organizer?.emailAddress?.address || null,
                isDeleted: !!externalEvent['@removed']
            };
        }
        throw new Error(`Mapper for ${provider} not implemented`);
    }

    private static parseMicrosoftDate(dateObj: any): Date {
        if (!dateObj || !dateObj.dateTime) return new Date();

        // If Microsoft explicitly says it's UTC, safely map to Z.
        if (dateObj.timeZone === "UTC" || dateObj.dateTime.endsWith('Z')) {
            return new Date(dateObj.dateTime + (dateObj.dateTime.endsWith('Z') ? "" : "Z"));
        }

        // Non-UTC Timezone Issue: "TIME IS NOT CREATE CRTLY" 
        // If MS returns e.g. "India Standard Time" and dateTime "2026-03-05T10:00:00.0000000"
        // appending "Z" turns 10 AM local into 10 AM UTC -> 3:30 PM local.
        // Instead, we MUST treat the dateTime as the exact local time string. 
        // Since we pass Prefer: outlook.timezone="UTC", we usually hit the UTC block above.
        // But if MS Graph ignores it or it fails, new Date(dateTime) without "Z" will parse it 
        // as the server's local machine time, which isn't perfect but prevents massive offset shifts 
        // compared to assuming UTC.
        // A full robust fix requires a Windows Timezone to IANA dictionary, but for now we avoid forcing Z.
        return new Date(dateObj.dateTime);
    }

    private static microsoftRecurrenceToRRule(recurrence: any): string | null {
        if (!recurrence || !recurrence.pattern) return null;

        const pattern = recurrence.pattern;
        const range = recurrence.range;
        const type = pattern.type; // 'daily' | 'weekly' | 'absoluteMonthly' | 'relativeMonthly' | 'absoluteYearly' | 'relativeYearly'
        const interval = pattern.interval || 1;

        let rrule = `FREQ=${type.toUpperCase().replace('ABSOLUTE', '').replace('RELATIVE', '')};INTERVAL=${interval}`;

        const dayMap: { [key: string]: string } = {
            'sunday': 'SU', 'monday': 'MO', 'tuesday': 'TU', 'wednesday': 'WE',
            'thursday': 'TH', 'friday': 'FR', 'saturday': 'SA'
        };

        if (type === 'weekly' && pattern.daysOfWeek) {
            const days = pattern.daysOfWeek.map((d: string) => dayMap[d.toLowerCase()]).filter((d: string) => !!d);
            if (days.length > 0) {
                rrule += `;BYDAY=${days.join(',')}`;
            }
        } else if (type === 'absoluteMonthly' && pattern.dayOfMonth) {
            rrule += `;BYMONTHDAY=${pattern.dayOfMonth}`;
        } else if (type === 'relativeMonthly' && pattern.daysOfWeek && pattern.index) {
            const days = pattern.daysOfWeek.map((d: string) => dayMap[d.toLowerCase()]).filter((d: string) => !!d);
            const indexMap: { [key: string]: string } = { 'first': '1', 'second': '2', 'third': '3', 'fourth': '4', 'last': '-1' };
            const index = indexMap[pattern.index.toLowerCase()] || '1';
            if (days.length > 0) {
                rrule += `;BYDAY=${index}${days[0]}`;
            }
        }

        if (range) {
            if (range.type === 'numbered' && range.numberOfOccurrences) {
                rrule += `;COUNT=${range.numberOfOccurrences}`;
            } else if (range.type === 'endDate' && range.endDate) {
                // MS endDate is YYYY-MM-DD. RRULE UNTIL needs YYYYMMDDTHHMMSSZ or YYYYMMDD
                const until = range.endDate.replace(/-/g, '');
                rrule += `;UNTIL=${until}T235959Z`;
            }
        }

        return rrule;
    }

    private static cleanMicrosoftBody(body: string | null): string | null {
        if (!body) return null;

        // 1. Aggressive split by common Microsoft separators (usually ~80 underscores or a line break block)
        // We use a regex to match 30 or more underscores OR dots, as the length can vary slightly.
        let cleaned = body;
        const separatorRegex = /[_.]{30,}/;
        const separatorPart = cleaned.split(separatorRegex);

        if (separatorPart.length > 1) {
            // Usually the user content is BEFORE the first separator line
            cleaned = separatorPart[0];
        }

        // 2. Specifically target the Microsoft Teams/Meeting invitation block by class or header
        // Microsoft often uses class="me-email-text", class="PlainText" or starts a block with "Microsoft Teams meeting"
        const inviteMarkers = [
            /<div[^>]*class=["']me-email-text["'][^>]*>/i,
            /<div[^>]*class=["']PlainText["'][^>]*>/i,
            /<span>Microsoft Teams meeting<\/span>/i,
            /Microsoft Teams meeting/i,
            /Join Teams Meeting/i,
            /Join on your computer, mobile app or room device/i
        ];

        for (const marker of inviteMarkers) {
            const index = cleaned.search(marker);
            if (index !== -1) {
                cleaned = cleaned.substring(0, index);
                break;
            }
        }

        // 3. Remove lingering HTML structure tags
        cleaned = cleaned
            .replace(/<html.*?>/is, "")
            .replace(/<head.*?>.*?<\/head>/is, "")
            .replace(/<body.*?>/is, "")
            .replace(/<\/body>/is, "")
            .replace(/<\/html>/is, "")
            .replace(/<\/div>/is, "")
            .replace(/<div.*?>/is, "")
            .replace(/<font.*?>/is, "")
            .replace(/<\/font>/is, "")
            .replace(/<span.*?>/is, "")
            .replace(/<\/span>/is, "")
            .trim();

        // 4. If the only thing left is empty tags (like <br> or <div></div>), treat as empty
        const textOnly = cleaned.replace(/<[^>]*>?/gm, "").replace(/&nbsp;/g, "").trim();
        if (textOnly === "" || textOnly === ".") {
            return null;
        }

        return cleaned;
    }

    /**
     * Process an incremental sync for a specific integration.
     * Uses a Redis distributed lock to prevent concurrent syncs.
     */
    static async processIncrementalSync(integrationId: string) {
        const integration = await prisma.calendarIntegration.findUnique({
            where: { id: integrationId }
        });

        if (!integration) return;

        // --- Redis Distributed Lock ---
        const lockKey = `sync:lock:${integrationId}`;
        const lockTTL = 120; // 2 minutes max hold time
        let redis: Awaited<ReturnType<typeof getRedisClient>> | null = null;
        let lockAcquired = false;

        try {
            redis = await getRedisClient();
            // SET NX EX: only set if not exists, with expiry. Atomic.
            const result = await redis.set(lockKey, '1', { NX: true, EX: lockTTL });
            lockAcquired = result === 'OK';
        } catch (err: any) {
            syncLogger.warn('Redis lock unavailable, falling back to DB isSyncing flag', { integrationId, error: err.message });
            // Fallback: use DB flag if Redis unavailable
            if ((integration as any).isSyncing) return;
        }

        if (!lockAcquired && redis !== null) {
            syncLogger.info('Sync already running (lock held), skipping', { integrationId });
            return;
        }

        // Mark as syncing in DB (for observability)
        await prisma.calendarIntegration.update({
            where: { id: integrationId },
            data: { isSyncing: true } as any
        });

        const provider = integration.provider;
        const userId = integration.userId;

        try {
            syncLogger.info('Incremental sync started', { integrationId, provider, userId });

            const { accessToken, calendarId } = await this.getValidAccessToken(integration.userId, integration.provider);
            const providerImpl = CalendarProviderFactory.getProvider(integration.provider);

            let token = "";
            if (integration.provider === CalendarProvider.GOOGLE) token = integration.googleSyncToken || "";
            else if (integration.provider === CalendarProvider.MICROSOFT) token = integration.microsoftDeltaLink || "";
            else if (integration.provider === CalendarProvider.ZOHO) token = integration.zohoLastSync ? integration.zohoLastSync.toISOString() : "";

            let hasMore = true;
            let currentToken = token;
            let totalEvents = 0;
            const syncedExternalIds = new Set<string>();

            while (hasMore) {
                const result = await providerImpl.getIncrementalChanges(accessToken, calendarId || "primary", currentToken);
                await this.handleSyncResult(integration.userId, integration.tenantId, integration.provider, result.events);

                if (integration.provider === CalendarProvider.ZOHO) {
                    for (const rawEvent of result.events) {
                        const mapped = this.mapToCalendarEvent(rawEvent, integration.provider, integration.userId, integration.tenantId);
                        syncedExternalIds.add(mapped.externalId);
                    }
                }

                currentToken = result.nextToken;
                hasMore = result.hasMore;
                totalEvents += result.events.length;

                // Safety break
                if (totalEvents > 5000) {
                    syncLogger.warn('Hit 5000 event limit during sync cycle, breaking loop', { integrationId });
                    break;
                }
            }

            // Perform diff-based deletion for Zoho since Zoho does not return deleted events in API responses.
            if (integration.provider === CalendarProvider.ZOHO) {
                const localEvents = await prisma.calendarEvent.findMany({
                    where: {
                        userId: integration.userId,
                        tenantId: integration.tenantId,
                        provider: CalendarProvider.ZOHO,
                        isDeleted: false
                    },
                    select: { externalId: true, startTime: true }
                });

                const syncStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
                const syncEnd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);     // 90 days ahead

                if (syncedExternalIds.size > 0) {
                    const missingExternalIds = localEvents
                        .filter(le => {
                            const leTime = new Date(le.startTime).getTime();
                            return leTime >= syncStart.getTime() && leTime <= syncEnd.getTime() && !syncedExternalIds.has(le.externalId);
                        })
                        .map(le => le.externalId);

                    if (missingExternalIds.length > 0) {
                        syncLogger.info(`[processIncrementalSync] Marking ${missingExternalIds.length} Zoho events as deleted due to absence in Zoho API response`, { missingExternalIds });
                        await prisma.calendarEvent.updateMany({
                            where: {
                                userId: integration.userId,
                                tenantId: integration.tenantId,
                                provider: CalendarProvider.ZOHO,
                                externalId: { in: missingExternalIds }
                            },
                            data: { isDeleted: true } as any
                        });
                    }
                } else {
                    syncLogger.info(`[processIncrementalSync] Marking all Zoho events in sync window as deleted since Zoho API returned 0 events`);
                    await prisma.calendarEvent.updateMany({
                        where: {
                            userId: integration.userId,
                            tenantId: integration.tenantId,
                            provider: CalendarProvider.ZOHO,
                            startTime: { gte: syncStart, lte: syncEnd }
                        },
                        data: { isDeleted: true } as any
                    });
                }
            }

            const updateData: any = {
                isSyncing: false,
                lastSyncAt: new Date(),
                lastSyncStatus: 'SUCCESS',
                syncErrorCount: 0,
                nextSyncDueAt: new Date(Date.now() + 15 * 60 * 1000)
            };

            if (integration.provider === CalendarProvider.GOOGLE) (updateData as any).googleSyncToken = currentToken;
            else if (integration.provider === CalendarProvider.MICROSOFT) (updateData as any).microsoftDeltaLink = currentToken;
            else if (integration.provider === CalendarProvider.ZOHO) (updateData as any).zohoLastSync = new Date(currentToken);

            await prisma.calendarIntegration.update({
                where: { id: integrationId },
                data: updateData as any
            });

            syncLogger.info('Incremental sync completed', {
                integrationId, provider, userId,
                eventCount: totalEvents,
            });

            return { events: [], nextToken: currentToken, hasMore: false };
        } catch (error: any) {
            syncLogger.error('Incremental sync failed', { integrationId, provider, userId, error: error.message });

            const errorCount = ((integration as any).syncErrorCount || 0) + 1;
            const backoffMinutes = Math.min(Math.pow(2, errorCount), 1440); // Max 24 hours

            await prisma.calendarIntegration.update({
                where: { id: integrationId },
                data: {
                    isSyncing: false,
                    lastSyncStatus: 'FAILED',
                    syncErrorCount: errorCount,
                    nextSyncDueAt: new Date(Date.now() + backoffMinutes * 60 * 1000)
                } as any
            });
            throw error;
        } finally {
            // Always release the Redis lock
            if (redis && lockAcquired) {
                try { await redis.del(lockKey); } catch { /* ignore */ }
            }
        }
    }

    private static async handleSyncResult(userId: string, tenantId: string, provider: CalendarProvider, events: any[]) {
        syncLogger.info(`Handling sync result for ${events.length} events from ${provider}`);
        for (const rawEvent of events) {
            // STEP 3 SaaS Rule: Ignore occurrences and exceptions explicitly for Microsoft
            if (provider === CalendarProvider.MICROSOFT) {
                if (rawEvent.type === 'occurrence' || rawEvent.type === 'exception') {
                    syncLogger.debug(`Ignoring MS ${rawEvent.type} event per SaaS rules`, { id: rawEvent.id });
                    continue; // Never store occurrences separately in SaaS
                }
            }

            const mapped = this.mapToCalendarEvent(rawEvent, provider, userId, tenantId);

            if (provider === CalendarProvider.ZOHO) {
                // Temporary debug log for duplication investigation
                syncLogger.debug(`Zoho mapped event`, {
                    uid: rawEvent.uid,
                    event_id: rawEvent.event_id,
                    externalId: mapped.externalId,
                    title: mapped.title,
                });
            } else if (provider === CalendarProvider.MICROSOFT) {
                syncLogger.debug(`Microsoft raw event`, {
                    id: rawEvent.id,
                    subject: rawEvent.subject,
                    start: rawEvent.start,
                    hasRecurrence: !!rawEvent.recurrence,
                    msType: rawEvent.type,
                    rawPayload: JSON.stringify(rawEvent)
                });
            }

            if ((mapped as any).isDeleted) {
                // Soft delete
                await prisma.calendarEvent.updateMany({
                    where: { provider, externalId: mapped.externalId, tenantId },
                    data: { isDeleted: true } as any
                });

                // Also handle cancellations in exception table if it's an instance
                if (provider === CalendarProvider.GOOGLE && rawEvent.recurringEventId) {
                    await this.handleInstanceCancellation(userId, tenantId, provider, rawEvent);
                } else if (provider === CalendarProvider.ZOHO && (rawEvent.recurrence_id || rawEvent.recurrenceid)) {
                    await this.handleInstanceCancellation(userId, tenantId, provider, rawEvent);
                }
            } else {
                // Determine if it's a series master or an instance
                let isInstance = false;
                if (provider === CalendarProvider.GOOGLE) isInstance = !!rawEvent.recurringEventId;
                else if (provider === CalendarProvider.MICROSOFT) isInstance = rawEvent.type === 'occurrence' || rawEvent.type === 'exception';
                else if (provider === CalendarProvider.ZOHO) isInstance = !!(rawEvent.recurrence_id || rawEvent.recurrenceid || rawEvent.parent_uid);

                if (isInstance) {
                    await this.handleInstanceUpsert(userId, tenantId, provider, rawEvent, mapped);
                } else {
                    // Regular upsert
                    let finalRrule = mapped.rrule;
                    let isRecurring = mapped.isRecurring;

                    // If it's a Zoho event that was deduplicated from instances, it might have isRecurring=true but rrule=null 
                    // because Zoho strips the rrule from instances. We must preserve the existing DB rrule to avoid data loss.
                    const existingEvent = await prisma.calendarEvent.findUnique({
                        where: { provider_externalId_tenantId: { provider, externalId: mapped.externalId, tenantId } }
                    });

                    if (provider === CalendarProvider.ZOHO && isRecurring && !finalRrule) {
                        if (existingEvent && existingEvent.rrule) {
                            finalRrule = existingEvent.rrule;
                        } else {
                            // If we genuinely have no rrule and no existing record, it can't be treated as a valid series master
                            isRecurring = false;
                        }
                    }

                    // For Microsoft Delta syncs: if a property is missing in the payload, MS Graph might have omitted it because it hasn't changed.
                    // We must preserve existing fields if rawEvent completely omitted the property.
                    let finalTitle = mapped.title;
                    let finalDescription = mapped.description;
                    let finalMeetingLink = mapped.meetingLink;
                    let finalStartTime = mapped.startTime;
                    let finalEndTime = mapped.endTime;
                    let finalIsRecurring = isRecurring;

                    if (provider === CalendarProvider.MICROSOFT && existingEvent) {
                        // If subject was genuinely missing (not just empty string), preserve existing
                        if (rawEvent.subject === undefined && existingEvent.title) {
                            finalTitle = existingEvent.title;
                        }
                        if (rawEvent.body === undefined && existingEvent.description) {
                            finalDescription = existingEvent.description;
                        }
                        if (rawEvent.onlineMeeting === undefined && rawEvent.onlineMeetingUrl === undefined && rawEvent.body === undefined && existingEvent.meetingLink) {
                            finalMeetingLink = existingEvent.meetingLink;
                        }
                        if (rawEvent.start === undefined && existingEvent.startTime) {
                            finalStartTime = existingEvent.startTime;
                        }
                        if (rawEvent.end === undefined && existingEvent.endTime) {
                            finalEndTime = existingEvent.endTime;
                        }
                        // Preserve RRULE if omitted in delta
                        if (rawEvent.recurrence === undefined && existingEvent.isRecurring && existingEvent.rrule) {
                            finalRrule = existingEvent.rrule;
                            finalIsRecurring = true;
                        }
                    }

                    const finalCalendar = existingEvent ? (existingEvent.calendar || mapped.calendar) : (mapped.calendar || "Personal Calendar");
                    const finalSourceType = existingEvent ? (existingEvent.sourceType || mapped.sourceType) : (mapped.sourceType || "Manual");

                    const createData = { ...mapped, title: finalTitle, description: finalDescription, meetingLink: finalMeetingLink, startTime: finalStartTime, endTime: finalEndTime, rrule: finalRrule, isRecurring: finalIsRecurring, calendar: finalCalendar, sourceType: finalSourceType };
                    const updateData = { ...mapped, title: finalTitle, description: finalDescription, meetingLink: finalMeetingLink, startTime: finalStartTime, endTime: finalEndTime, rrule: finalRrule, isRecurring: finalIsRecurring, calendar: finalCalendar, sourceType: finalSourceType };

                    await prisma.calendarEvent.upsert({
                        where: { provider_externalId_tenantId: { provider, externalId: mapped.externalId, tenantId } },
                        create: createData,
                        update: updateData
                    });
                }
            }
        }
    }

    private static async handleInstanceCancellation(userId: string, tenantId: string, provider: CalendarProvider, rawEvent: any) {
        let masterExternalId = "";
        let originalDate: Date | null = null;

        if (provider === CalendarProvider.GOOGLE) {
            masterExternalId = rawEvent.recurringEventId;
            originalDate = new Date(rawEvent.originalStartTime?.dateTime || rawEvent.originalStartTime?.date);
        } else if (provider === CalendarProvider.ZOHO) {
            masterExternalId = rawEvent.parent_uid || rawEvent.parent_id;
            originalDate = this.parseZohoDate(rawEvent.recurrence_id || rawEvent.recurrenceid);
        }

        if (masterExternalId && originalDate) {
            originalDate.setUTCHours(0, 0, 0, 0);
            const master = await this.findMaster(provider, masterExternalId, tenantId);
            if (master) {
                await prisma.calendarEventException.upsert({
                    where: { eventId_originalDate: { eventId: master.id, originalDate } },
                    create: { eventId: master.id, tenantId, userId, originalDate, createdById: userId, isCancelled: true },
                    update: { isCancelled: true }
                });
            }
        }
    }

    private static async handleInstanceUpsert(userId: string, tenantId: string, provider: CalendarProvider, rawEvent: any, mapped: any) {
        let masterExternalId = "";
        let originalDate: Date | null = null;

        if (provider === CalendarProvider.GOOGLE) {
            masterExternalId = rawEvent.recurringEventId;
            originalDate = new Date(rawEvent.originalStartTime?.dateTime || rawEvent.originalStartTime?.date);
        } else if (provider === CalendarProvider.MICROSOFT) {
            masterExternalId = rawEvent.seriesMasterId;
            originalDate = new Date(rawEvent.originalStartTime?.dateTime);
        } else if (provider === CalendarProvider.ZOHO) {
            masterExternalId = rawEvent.parent_uid || rawEvent.parent_id;
            originalDate = this.parseZohoDate(rawEvent.recurrence_id || rawEvent.recurrenceid);
        }

        if (masterExternalId && originalDate) {
            originalDate.setUTCHours(0, 0, 0, 0);
            const master = await this.findMaster(provider, masterExternalId, tenantId);
            if (master) {
                const exData = {
                    eventId: master.id,
                    tenantId,
                    userId,
                    originalDate,
                    isCancelled: false,
                    overrideTitle: mapped.title,
                    overrideDescription: mapped.description,
                    overrideLocation: mapped.location,
                    overrideMeetingLink: mapped.meetingLink,
                    overrideAttendees: mapped.attendees || undefined,
                    newStartTime: mapped.startTime,
                    newEndTime: mapped.endTime,
                    createdById: userId,
                    updatedById: userId,
                    externalInstanceId: mapped.externalId
                };
                await prisma.calendarEventException.upsert({
                    where: { eventId_originalDate: { eventId: master.id, originalDate } },
                    create: exData,
                    update: exData
                });
                return;
            }
        }

        // Fallback: master not found or couldn't resolve original date, upsert as standalone
        const existingEvent = await prisma.calendarEvent.findUnique({
            where: { provider_externalId_tenantId: { provider, externalId: mapped.externalId, tenantId } }
        });
        const finalCalendar = existingEvent ? (existingEvent.calendar || mapped.calendar) : (mapped.calendar || "Personal Calendar");
        const finalSourceType = existingEvent ? (existingEvent.sourceType || mapped.sourceType) : (mapped.sourceType || "Manual");

        const dataWithFields = { ...mapped, calendar: finalCalendar, sourceType: finalSourceType };

        await prisma.calendarEvent.upsert({
            where: { provider_externalId_tenantId: { provider, externalId: mapped.externalId, tenantId } },
            create: dataWithFields,
            update: dataWithFields
        });
    }

    private static async findMaster(provider: CalendarProvider, externalId: string, tenantId: string) {
        return prisma.calendarEvent.findFirst({
            where: { provider, externalId, tenantId }
        });
    }

    private static parseZohoDate(raw: string): Date {
        if (!raw) return new Date();
        if (raw.includes("-")) return new Date(raw);
        if (raw.length === 8 && !raw.includes("T")) {
            return new Date(raw.replace(/^(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"));
        }
        const iso = raw.replace(
            /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
            "$1-$2-$3T$4:$5:$6"
        );
        return new Date(iso);
    }
}
