"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarController = void 0;
const database_1 = require("@/config/database");
const axios_1 = __importDefault(require("axios"));
const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const ZOHO_REDIRECT_URI = process.env.ZOHO_REDIRECT_URI;
const ZOHO_AUTH_URL = "https://accounts.zoho.in/oauth/v2/auth";
const ZOHO_TOKEN_URL = "https://accounts.zoho.in/oauth/v2/token";
const ZOHO_CALENDAR_API = "https://calendar.zoho.in/api/v1";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3005";
// ─── Token Helper ────────────────────────────────────────────────────────────
async function refreshTokenIfNeeded(userId) {
    const user = await database_1.prisma.user.findUnique({
        where: { id: userId },
        select: {
            zohoAccessToken: true,
            zohoRefreshToken: true,
            zohoTokenExpiry: true,
        },
    });
    if (!user?.zohoAccessToken || !user?.zohoRefreshToken) {
        throw new Error("Zoho account not connected");
    }
    // If token expires in more than 5 minutes, reuse it
    const fiveMinutes = 5 * 60 * 1000;
    if (user.zohoTokenExpiry &&
        user.zohoTokenExpiry.getTime() - Date.now() > fiveMinutes) {
        return user.zohoAccessToken;
    }
    // Refresh the token
    const params = new URLSearchParams({
        refresh_token: user.zohoRefreshToken,
        client_id: ZOHO_CLIENT_ID,
        client_secret: ZOHO_CLIENT_SECRET,
        grant_type: "refresh_token",
    });
    const response = await axios_1.default.post(`${ZOHO_TOKEN_URL}?${params.toString()}`);
    const { access_token, expires_in } = response.data;
    if (!access_token) {
        throw new Error("Failed to refresh Zoho access token");
    }
    const expiry = new Date(Date.now() + (expires_in || 3600) * 1000);
    await database_1.prisma.user.update({
        where: { id: userId },
        data: {
            zohoAccessToken: access_token,
            zohoTokenExpiry: expiry,
        },
    });
    return access_token;
}
// ─── Zoho Date Helpers ──────────────────────────────────────────────────────
/**
 * Zoho returns dates in compact format: "20260201T090000Z" or "20260201"
 * new Date() cannot parse this on all environments — convert to ISO first.
 */
function parseZohoDate(raw) {
    if (!raw)
        return new Date();
    // Already a valid ISO string (contains dashes)
    if (raw.includes("-"))
        return new Date(raw);
    // Compact format: yyyyMMdd (All-day) → yyyy-MM-dd
    if (raw.length === 8 && !raw.includes("T")) {
        return new Date(raw.replace(/^(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"));
    }
    // Compact format: yyyyMMddTHHmmssZ  →  yyyy-MM-ddTHH:mm:ssZ
    const iso = raw.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6");
    return new Date(iso);
}
/**
 * Convert ISO string or Date object to Zoho's compact format.
 */
function toZohoDate(iso, allDay) {
    const date = new Date(iso);
    if (isNaN(date.getTime()))
        return "";
    const isoStr = date.toISOString();
    if (allDay) {
        return isoStr.split("T")[0].replace(/-/g, ""); // yyyyMMdd
    }
    return isoStr.replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // yyyyMMddTHHmmssZ
}
// ─── Controller ──────────────────────────────────────────────────────────────
class CalendarController {
    /**
     * GET /api/zoho/status
     * Returns whether the current user has connected their Zoho account.
     */
    static async getStatus(req, res) {
        try {
            if (!req.user) {
                res.status(200).json({
                    success: true,
                    data: { connected: false },
                });
                return;
            }
            const user = await database_1.prisma.user.findUnique({
                where: { id: req.user.id },
                select: {
                    zohoAccessToken: true,
                    zohoCalendarId: true,
                    zohoTokenExpiry: true,
                    zohoLastSync: true,
                },
            });
            const connected = !!(user?.zohoAccessToken);
            res.status(200).json({
                success: true,
                data: {
                    connected,
                    calendarId: user?.zohoCalendarId || null,
                    tokenExpiry: user?.zohoTokenExpiry || null,
                    lastSync: user?.zohoLastSync || null,
                },
            });
        }
        catch (error) {
            console.error("Zoho status error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get Zoho status",
            });
        }
    }
    /**
     * GET /api/zoho/connect
     * Redirects user to Zoho OAuth2 authorization page.
     */
    static async connect(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }
            // Store userId in session so callback can identify the user
            req.session.zohoUserId = req.user.id;
            req.session.zohoState = req.user.id; // simple state = userId
            const params = new URLSearchParams({
                response_type: "code",
                client_id: ZOHO_CLIENT_ID,
                redirect_uri: ZOHO_REDIRECT_URI,
                scope: "ZohoCalendar.calendar.all,ZohoCalendar.event.all,ZohoMeeting.meeting.ALL",
                access_type: "offline",
                prompt: "consent", // Always return refresh_token
                state: req.user.id,
            });
            const authUrl = `${ZOHO_AUTH_URL}?${params.toString()}`;
            res.status(200).json({
                success: true,
                data: { authUrl },
            });
        }
        catch (error) {
            console.error("Zoho connect error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to initiate Zoho connection",
            });
        }
    }
    /**
     * GET /api/zoho/callback
     * Handles Zoho OAuth2 callback, exchanges code for tokens.
     */
    static async callback(req, res) {
        try {
            const { code, state, error: oauthError } = req.query;
            if (oauthError) {
                console.error("Zoho OAuth error:", oauthError);
                return res.redirect(`${FRONTEND_URL}/calendar?error=zoho_denied`);
            }
            if (!code || !state) {
                return res.redirect(`${FRONTEND_URL}/calendar?error=missing_params`);
            }
            // state = userId
            const userId = state;
            // Exchange code for tokens
            const params = new URLSearchParams({
                code,
                client_id: ZOHO_CLIENT_ID,
                client_secret: ZOHO_CLIENT_SECRET,
                redirect_uri: ZOHO_REDIRECT_URI,
                grant_type: "authorization_code",
            });
            const tokenResponse = await axios_1.default.post(`${ZOHO_TOKEN_URL}?${params.toString()}`);
            const { access_token, refresh_token: new_refresh_token, expires_in } = tokenResponse.data;
            if (!access_token) {
                console.error("Token exchange failed:", tokenResponse.data);
                return res.redirect(`${FRONTEND_URL}/calendar?error=token_exchange_failed`);
            }
            // Zoho may omit refresh_token on re-authorization — fall back to existing one in DB
            let refresh_token = new_refresh_token;
            if (!refresh_token) {
                const existingUser = await database_1.prisma.user.findUnique({
                    where: { id: userId },
                    select: { zohoRefreshToken: true },
                });
                refresh_token = existingUser?.zohoRefreshToken || null;
            }
            if (!refresh_token) {
                console.error("No refresh token available — user must re-authorize");
                return res.redirect(`${FRONTEND_URL}/calendar?error=token_exchange_failed`);
            }
            const expiry = new Date(Date.now() + (expires_in || 3600) * 1000);
            // Fetch the user's default calendar ID
            let calendarId = null;
            try {
                const calResponse = await axios_1.default.get(`${ZOHO_CALENDAR_API}/calendars`, {
                    headers: { Authorization: `Zoho-oauthtoken ${access_token}` },
                });
                const calendars = calResponse.data?.calendars || [];
                const defaultCal = calendars.find((c) => c.isdefault) || calendars[0];
                calendarId = defaultCal?.uid || null;
            }
            catch (calErr) {
                console.warn("Could not fetch Zoho calendars:", calErr);
            }
            // Save tokens to user record
            await database_1.prisma.user.update({
                where: { id: userId },
                data: {
                    zohoAccessToken: access_token,
                    zohoRefreshToken: refresh_token,
                    zohoTokenExpiry: expiry,
                    zohoCalendarId: calendarId,
                },
            });
            res.redirect(`${FRONTEND_URL}/calendar?connected=true`);
        }
        catch (error) {
            console.error("Zoho callback error:", error);
            res.redirect(`${FRONTEND_URL}/calendar?error=callback_failed`);
        }
    }
    /**
     * POST /api/zoho/disconnect
     * Clears Zoho tokens from the user record.
     */
    static async disconnect(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }
            await database_1.prisma.user.update({
                where: { id: req.user.id },
                data: {
                    zohoAccessToken: null,
                    zohoRefreshToken: null,
                    zohoTokenExpiry: null,
                    zohoCalendarId: null,
                },
            });
            res.status(200).json({
                success: true,
                message: "Zoho account disconnected successfully",
            });
        }
        catch (error) {
            console.error("Zoho disconnect error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to disconnect Zoho account",
            });
        }
    }
    /**
     * GET /api/zoho/events
     * Fetches events from Zoho Calendar and syncs to DB.
     * NOTE: Zoho Calendar API does NOT support range_start/range_end query params
     * on the events list endpoint — they cause EXTRA_PARAM_FOUND.
     * We fetch all events from Zoho, upsert to DB, then filter by date in DB.
     */
    static async getEvents(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }
            const { startDate, endDate } = req.query;
            const user = await database_1.prisma.user.findUnique({
                where: { id: req.user.id },
                select: { zohoCalendarId: true },
            });
            if (!user?.zohoCalendarId) {
                res.status(400).json({
                    success: false,
                    error: "Zoho account not connected or calendar ID not found",
                });
                return;
            }
            const accessToken = await refreshTokenIfNeeded(req.user.id);
            // Fetch ALL events from Zoho — no date params (they cause EXTRA_PARAM_FOUND)
            console.log(`[Zoho] Fetching events from: ${ZOHO_CALENDAR_API}/calendars/${user.zohoCalendarId}/events`);
            const zohoRes = await axios_1.default.get(`${ZOHO_CALENDAR_API}/calendars/${user.zohoCalendarId}/events`, { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } });
            const zohoEvents = zohoRes.data?.events || [];
            console.log(`[Zoho] Fetched ${zohoEvents.length} events from Zoho`);
            // Filter out events missing valid IDs (avoid "undefined" eventId error)
            const validEvents = zohoEvents.filter((e) => e.uid || e.event_id);
            if (validEvents.length < zohoEvents.length) {
                console.warn(`[Zoho] Filtered out ${zohoEvents.length - validEvents.length} malformed events missing UID`);
            }
            // Group events by UID to handle exclusions and master records
            const groupedEvents = new Map();
            validEvents.forEach((e) => {
                const uid = e.uid || e.event_id;
                if (!groupedEvents.has(uid))
                    groupedEvents.set(uid, []);
                groupedEvents.get(uid).push(e);
            });
            const upsertOps = [];
            for (const [uid, items] of groupedEvents.entries()) {
                // The "master" event is the one NOT marked as deleted
                const master = items.find((it) => it.estatus !== "deleted") || items[0];
                const deletedInstances = items.filter((it) => it.estatus === "deleted");
                const startRaw = master.dateandtime?.start || master.startdatetime;
                const endRaw = master.dateandtime?.end || master.enddatetime;
                const startTime = parseZohoDate(startRaw);
                const endTime = parseZohoDate(endRaw);
                const isAllDay = master.isallday === true || master.isallday === "true";
                const isRecurring = !!master.rrule || master.isrep === true || master.isrep === "true";
                // Consolidate exclusions
                let exdates = [];
                if (master.exdate) {
                    exdates = typeof master.exdate === "string" ? master.exdate.split(",") : (Array.isArray(master.exdate) ? master.exdate : []);
                }
                deletedInstances.forEach((d) => {
                    if (d.recurrenceid && !exdates.includes(d.recurrenceid)) {
                        exdates.push(d.recurrenceid);
                    }
                });
                const deterministicId = `${req.user.tenantId}_${uid}`;
                // PRESERVE: Fetch existing exdate from DB to prevent overwriting manual deletions
                const existing = await database_1.prisma.zohoEvent.findUnique({
                    where: { id: deterministicId },
                    select: { exdate: true }
                });
                const localExdates = Array.isArray(existing?.exdate)
                    ? existing?.exdate
                    : (typeof existing?.exdate === "string" ? (existing?.exdate).split(",") : []);
                // Merge: Zoho's new findings + our local manual record
                const mergedExdates = Array.from(new Set([...exdates, ...localExdates]));
                upsertOps.push(database_1.prisma.zohoEvent.upsert({
                    where: { id: deterministicId },
                    create: {
                        id: deterministicId,
                        eventId: uid,
                        calendarId: user.zohoCalendarId,
                        tenantId: req.user.tenantId,
                        title: master.title || "Untitled",
                        description: master.description || null,
                        startTime,
                        endTime,
                        location: master.location || null,
                        userId: req.user.id,
                        isAllDay: !!isAllDay,
                        isRecurring: !!isRecurring,
                        rrule: master.rrule || null,
                        exdate: mergedExdates.length > 0 ? mergedExdates : null,
                        meetingLink: master.conference_data?.meetingdata?.meeting_link || master.app_data?.meetingdata?.meetinglink || master.meetingLink || null,
                    },
                    update: {
                        title: master.title || "Untitled",
                        description: master.description || null,
                        startTime,
                        endTime,
                        location: master.location || null,
                        isAllDay: !!isAllDay,
                        isRecurring: !!isRecurring,
                        rrule: master.rrule || null,
                        exdate: mergedExdates.length > 0 ? mergedExdates : null,
                        meetingLink: master.conference_data?.meetingdata?.meeting_link || master.app_data?.meetingdata?.meetinglink || master.meetingLink || null,
                        updatedById: req.user.id,
                    },
                }));
            }
            if (upsertOps.length > 0) {
                await database_1.prisma.$transaction(upsertOps);
            }
            // Filter by date range in DB
            // FIXED: Broaden filter to include ALL recurring events so they can be expanded/hidden locally
            const where = {
                tenantId: req.user.tenantId,
                OR: [
                    { isRecurring: true }, // Always include series
                    {
                        AND: [
                            startDate ? { startTime: { gte: new Date(startDate) } } : {},
                            endDate ? { startTime: { lte: new Date(endDate) } } : {},
                        ]
                    }
                ]
            };
            const dbEvents = await database_1.prisma.zohoEvent.findMany({
                where,
                orderBy: { startTime: "asc" },
            });
            res.status(200).json({
                success: true,
                data: dbEvents,
            });
        }
        catch (error) {
            console.error("Zoho get events error:", error?.response?.data || error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch Zoho events",
            });
        }
    }
    /**
     * POST /api/zoho/events
     * Creates a new event on Zoho Calendar and saves to DB.
     */
    static async createEvent(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }
            const { title, description, startTime, endTime, location, isRecurring, isAllDay, calendar, sourceType, attendees, generateMeeting } = req.body;
            if (!title || !startTime || !endTime) {
                res.status(400).json({
                    success: false,
                    error: "title, startTime, and endTime are required",
                });
                return;
            }
            const user = await database_1.prisma.user.findUnique({
                where: { id: req.user.id },
                select: { zohoCalendarId: true },
            });
            if (!user?.zohoCalendarId) {
                res.status(400).json({
                    success: false,
                    error: "Zoho account not connected",
                });
                return;
            }
            const accessToken = await refreshTokenIfNeeded(req.user.id);
            // Zoho requires compact ISO format: yyyyMMddTHHmmssZ
            // For all-day events, it MUST be yyyyMMdd
            // Zoho V1 API structure: isrep and rrule are top-level in eventdata
            const eventPayload = {
                title,
                description: description || "",
                dateandtime: {
                    start: toZohoDate(startTime, !!isAllDay),
                    end: toZohoDate(endTime, !!isAllDay),
                },
                location: location || "",
                isallday: !!isAllDay,
                isrep: !!isRecurring,
            };
            // Add attendees if provided
            if (attendees && Array.isArray(attendees) && attendees.length > 0) {
                eventPayload.attendees = attendees.map(email => ({ email }));
            }
            // Add conferencing for Zoho Meeting if requested
            if (generateMeeting) {
                eventPayload.conference = "zmeeting";
            }
            // Only add timezone for timed events
            if (!isAllDay) {
                eventPayload.dateandtime.timezone = "Asia/Kolkata";
            }
            if (isRecurring) {
                // Zoho requires a limit for recurring meetings
                eventPayload.rrule = generateMeeting ? "FREQ=DAILY;INTERVAL=1;COUNT=50" : "FREQ=DAILY;INTERVAL=1";
            }
            console.log(`[Zoho] Final Event Payload for ${title}:`, JSON.stringify(eventPayload));
            const formBody = new URLSearchParams();
            formBody.append("eventdata", JSON.stringify(eventPayload));
            console.log(`[Zoho] Creating event: ${title}`);
            const zohoRes = await axios_1.default.post(`${ZOHO_CALENDAR_API}/calendars/${user.zohoCalendarId}/events`, formBody, {
                headers: {
                    Authorization: `Zoho-oauthtoken ${accessToken}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            });
            console.log(`[Zoho] Create event response:`, JSON.stringify(zohoRes.data));
            // Zoho returns the event in events[0]; extract uid or id
            const createdEvent = zohoRes.data?.events?.[0];
            const eventId = createdEvent?.uid || createdEvent?.id;
            const meetingLink = createdEvent?.conference_data?.meetingdata?.meeting_link ||
                createdEvent?.app_data?.meetingdata?.meetinglink ||
                null;
            if (!eventId) {
                console.error("[Zoho] No event ID in response:", zohoRes.data);
                res.status(500).json({
                    success: false,
                    error: "Zoho did not return the created event ID",
                });
                return;
            }
            // Save to DB
            const deterministicId = `${req.user.tenantId}_${eventId}`;
            const dbEvent = await database_1.prisma.zohoEvent.upsert({
                where: { id: deterministicId },
                create: {
                    id: deterministicId,
                    userId: req.user.id,
                    tenantId: req.user.tenantId, // Added tenantId
                    eventId: eventId,
                    calendarId: user.zohoCalendarId,
                    title,
                    description: description || "",
                    startTime: new Date(startTime),
                    endTime: new Date(endTime),
                    location: location || "",
                    isAllDay: !!isAllDay,
                    isRecurring: !!isRecurring,
                    rrule: isRecurring ? (generateMeeting ? "FREQ=DAILY;INTERVAL=1;COUNT=50" : "FREQ=DAILY;INTERVAL=1") : null,
                    exdate: createdEvent?.exdate || null,
                    calendar,
                    sourceType,
                    attendees: attendees || [],
                    meetingLink: meetingLink,
                },
                update: {
                    title,
                    description: description || "",
                    startTime: new Date(startTime),
                    endTime: new Date(endTime),
                    location: location || "",
                    isAllDay: !!isAllDay,
                    isRecurring: !!isRecurring,
                    rrule: isRecurring ? (generateMeeting ? "FREQ=DAILY;INTERVAL=1;COUNT=50" : "FREQ=DAILY;INTERVAL=1") : null,
                    exdate: createdEvent?.exdate || null,
                    calendar,
                    sourceType,
                    attendees: attendees || [],
                    meetingLink: meetingLink,
                    updatedById: req.user.id, // Added updatedById
                }
            });
            res.status(201).json({
                success: true,
                data: dbEvent,
                message: "Event created successfully",
            });
        }
        catch (error) {
            const zohoError = error?.response?.data?.error?.[0];
            console.error("Zoho create event error:", JSON.stringify(error?.response?.data || error));
            res.status(500).json({
                success: false,
                error: zohoError ? `${zohoError.message}: ${zohoError.description}` : "Failed to create Zoho event",
            });
        }
    }
    /**
     * PUT /api/zoho/events/:id
     * Updates an event on Zoho Calendar and in DB.
     * Zoho requires an If-Match: <etag> header — fetch the ETag first via GET.
     */
    static async updateEvent(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }
            const { id } = req.params;
            const { title, description, startTime, endTime, location, isRecurring, isAllDay, calendar, sourceType, attendees, generateMeeting } = req.body;
            const dbEvent = await database_1.prisma.zohoEvent.findFirst({
                where: { id, tenantId: req.user.tenantId },
            });
            if (!dbEvent) {
                res.status(404).json({ success: false, error: "Event not found" });
                return;
            }
            const user = await database_1.prisma.user.findUnique({
                where: { id: req.user.id },
                select: { zohoCalendarId: true },
            });
            const accessToken = await refreshTokenIfNeeded(req.user.id);
            const eventUrl = `${ZOHO_CALENDAR_API}/calendars/${user?.zohoCalendarId}/events/${dbEvent.eventId}`;
            // Step 1: Fetch the current ETag for this event (required by Zoho for PUT)
            // Zoho returns ETag in the response BODY as events[0].etag, not in headers
            const getRes = await axios_1.default.get(eventUrl, {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            });
            console.log("[Zoho] GET event body:", JSON.stringify(getRes.data));
            const etag = getRes.data?.events?.[0]?.etag;
            if (!etag) {
                console.error("[Zoho] No ETag in GET response body:", getRes.data);
                res.status(500).json({ success: false, error: "Could not retrieve event ETag from Zoho" });
                return;
            }
            const eventPayload = {
                etag, // ETag must be inside eventdata JSON for Zoho PUT
                title: title || dbEvent.title,
                description: description ?? dbEvent.description ?? "",
                dateandtime: {
                    start: toZohoDate(startTime || dbEvent.startTime, !!isAllDay),
                    end: toZohoDate(endTime || dbEvent.endTime, !!isAllDay),
                },
                location: location ?? dbEvent.location ?? "",
                isallday: isAllDay === undefined ? dbEvent.isAllDay : !!isAllDay,
                isrep: isRecurring !== undefined ? !!isRecurring : dbEvent.isRecurring,
            };
            if (!(isAllDay === undefined ? dbEvent.isAllDay : !!isAllDay)) {
                eventPayload.dateandtime.timezone = "Asia/Kolkata";
            }
            const isActuallyMeeting = generateMeeting || !!dbEvent.meetingLink;
            if (isRecurring !== undefined ? isRecurring : dbEvent.isRecurring) {
                // Zoho requires a limit for recurring meetings
                eventPayload.rrule = isActuallyMeeting ? "FREQ=DAILY;INTERVAL=1;COUNT=50" : "FREQ=DAILY;INTERVAL=1";
            }
            // Sync attendees if provided - Zoho V1 requires at least 1 attendee if key is present
            if (attendees !== undefined && Array.isArray(attendees) && attendees.length > 0) {
                eventPayload.attendees = attendees.map(email => ({ email }));
            }
            // Sync conferencing if requested
            if (generateMeeting) {
                eventPayload.conference = "zmeeting";
            }
            console.log(`[Zoho] Final Update Payload for ${title || dbEvent.title}:`, JSON.stringify(eventPayload));
            const formBody = new URLSearchParams();
            formBody.append("eventdata", JSON.stringify(eventPayload));
            // Step 2: PUT — ETag is embedded inside eventdata JSON (Zoho requirement)
            const zohoRes = await axios_1.default.put(eventUrl, formBody, {
                headers: {
                    Authorization: `Zoho-oauthtoken ${accessToken}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            });
            const updatedZohoEvent = zohoRes.data?.events?.[0];
            const meetingLink = updatedZohoEvent?.conference_data?.meetingdata?.meeting_link ||
                updatedZohoEvent?.app_data?.meetingdata?.meetinglink ||
                dbEvent.meetingLink;
            const dataUpdate = {
                title: title || dbEvent.title,
                description: description ?? dbEvent.description,
                startTime: startTime ? new Date(startTime) : dbEvent.startTime,
                endTime: endTime ? new Date(endTime) : dbEvent.endTime,
                location: location ?? dbEvent.location,
                isAllDay: isAllDay !== undefined ? !!isAllDay : dbEvent.isAllDay,
                isRecurring: isRecurring !== undefined ? !!isRecurring : dbEvent.isRecurring,
                rrule: (isRecurring !== undefined ? isRecurring : dbEvent.isRecurring)
                    ? (isActuallyMeeting ? "FREQ=DAILY;INTERVAL=1;COUNT=50" : "FREQ=DAILY;INTERVAL=1")
                    : null,
                exdate: updatedZohoEvent?.exdate || dbEvent.exdate || null,
                calendar: calendar !== undefined ? calendar : dbEvent.calendar,
                sourceType: sourceType !== undefined ? sourceType : dbEvent.sourceType,
                attendees: attendees || dbEvent.attendees || [],
                meetingLink: meetingLink,
                updatedById: req.user.id,
                tenantId: req.user.tenantId,
            };
            const updatedEvent = await database_1.prisma.zohoEvent.update({
                where: { id },
                data: dataUpdate,
            });
            res.status(200).json({
                success: true,
                data: updatedEvent,
                message: "Event updated successfully",
            });
        }
        catch (error) {
            const zohoError = error?.response?.data?.error?.[0];
            console.error("Zoho update event error:", JSON.stringify(error?.response?.data || error));
            res.status(500).json({
                success: false,
                error: zohoError ? `${zohoError.message}: ${zohoError.description}` : "Failed to update Zoho event"
            });
        }
    }
    /**
     * DELETE /api/zoho/events/:id
     * Deletes an event from Zoho Calendar and from DB.
     * Zoho requires an If-Match: <etag> header — fetch the ETag first via GET.
     */
    static async deleteEvent(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }
            const { id } = req.params;
            const dbEvent = await database_1.prisma.zohoEvent.findFirst({
                where: { id, tenantId: req.user.tenantId },
            });
            if (!dbEvent) {
                res.status(404).json({ success: false, error: "Event not found" });
                return;
            }
            const user = await database_1.prisma.user.findUnique({
                where: { id: req.user.id },
                select: { zohoCalendarId: true },
            });
            const accessToken = await refreshTokenIfNeeded(req.user.id);
            const eventUrl = `${ZOHO_CALENDAR_API}/calendars/${user?.zohoCalendarId}/events/${dbEvent.eventId}`;
            // Step 1: Fetch the current ETag for this event (required by Zoho for DELETE)
            // Zoho returns ETag in the response BODY as events[0].etag, not in headers
            const getRes = await axios_1.default.get(eventUrl, {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            });
            console.log("[Zoho] GET event body:", JSON.stringify(getRes.data));
            // Find the event item that has an ETag (sometimes the first one is a deleted placeholder)
            const etag = getRes.data?.events?.find((e) => e.etag)?.etag;
            if (!etag) {
                console.error("[Zoho] No ETag found in GET response events:", getRes.data);
                res.status(500).json({ success: false, error: "Could not retrieve event ETag from Zoho" });
                return;
            }
            const { action, occurrenceDate } = req.query;
            // Step 2: DELETE — etag must be inside eventdata JSON (same as PUT)
            // A bare etag form field causes EXTRA_PARAM_FOUND
            const eventData = { etag };
            // If deleting a specific occurrence (action=0), Zoho V1 needs recurrenceid
            if (action === "0" && occurrenceDate) {
                eventData.recurrenceid = toZohoDate(occurrenceDate, !!dbEvent.isAllDay);
                eventData.recurrence_edittype = "only";
            }
            const deleteBody = new URLSearchParams();
            deleteBody.append("eventdata", JSON.stringify(eventData));
            // NOTE: Removed ?action=X query param as it causes EXTRA_PARAM_FOUND with DELETE method.
            // Zoho V1 implicitly uses recurrenceid in eventdata to distinguish instance vs series deletion.
            const deleteUrl = eventUrl;
            console.log(`[Zoho] Deleting event: url=${deleteUrl}, payload=${JSON.stringify(eventData)}`);
            const zohoDeleteRes = await axios_1.default.delete(deleteUrl, {
                headers: {
                    Authorization: `Zoho-oauthtoken ${accessToken}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data: deleteBody,
            });
            console.log(`[Zoho] Delete response:`, JSON.stringify(zohoDeleteRes.data));
            // If it's a recurring event:
            // - action === '0' (one day): Zoho excludes the day, we keep the series.
            // - action === '2' (all days): Zoho deletes the series, we delete locally.
            // - action === undefined: Zoho's default is to delete the entire series.
            const shouldDeleteLocally = !dbEvent.isRecurring || action === "2" || action === undefined;
            if (shouldDeleteLocally) {
                await database_1.prisma.zohoEvent.delete({ where: { id } });
            }
            else if (action === "0" && occurrenceDate) {
                // Manually append the excluded date to our local DB to ensure immediate visibility
                const formattedExdate = toZohoDate(occurrenceDate, !!dbEvent.isAllDay);
                let currentExdates = [];
                if (dbEvent.exdate) {
                    currentExdates = Array.isArray(dbEvent.exdate) ? dbEvent.exdate : (typeof dbEvent.exdate === "string" ? dbEvent.exdate.split(",") : []);
                }
                if (!currentExdates.includes(formattedExdate)) {
                    currentExdates.push(formattedExdate);
                    await database_1.prisma.zohoEvent.update({
                        where: { id },
                        data: { exdate: currentExdates }
                    });
                }
            }
            res.status(200).json({
                success: true,
                message: "Event deleted successfully",
            });
        }
        catch (error) {
            const zohoError = error?.response?.data;
            console.error("Zoho delete event error details:", JSON.stringify(zohoError || error.message || error));
            const isNotFound = Array.isArray(zohoError?.error) && zohoError?.error?.some((e) => e.message === "EVENT_NOTFOUND");
            if (isNotFound) {
                console.log("[Zoho] Event already deleted on Zoho, cleaning up local DB...");
                const { id } = req.params;
                const dbEvent = await database_1.prisma.zohoEvent.findUnique({ where: { id } });
                const { action } = req.query;
                if (dbEvent && (!dbEvent.isRecurring || action === "2")) {
                    await database_1.prisma.zohoEvent.delete({ where: { id } }).catch(() => { });
                }
                res.status(200).json({
                    success: true,
                    message: "Event already deleted on Zoho, local DB cleaned up",
                });
                return;
            }
            res.status(500).json({ success: false, error: "Failed to delete Zoho event" });
        }
    }
    /**
     * POST /api/zoho/sync
     * Full sync: fetches all events from Zoho and upserts into DB.
     */
    static async syncEvents(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, error: "Authentication required" });
                return;
            }
            const user = await database_1.prisma.user.findUnique({
                where: { id: req.user.id },
                select: { zohoCalendarId: true },
            });
            if (!user?.zohoCalendarId) {
                res.status(400).json({
                    success: false,
                    error: "Zoho account not connected",
                });
                return;
            }
            const accessToken = await refreshTokenIfNeeded(req.user.id);
            const zohoRes = await axios_1.default.get(`${ZOHO_CALENDAR_API}/calendars/${user.zohoCalendarId}/events`, { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } });
            const zohoEvents = zohoRes.data?.events || [];
            // Filter out events missing valid IDs (avoid "undefined" eventId error)
            const validEvents = zohoEvents.filter((e) => e.uid || e.event_id);
            if (validEvents.length < zohoEvents.length) {
                console.warn(`[Zoho] Filtered out ${zohoEvents.length - validEvents.length} malformed events missing UID`);
            }
            // Group events by UID to handle exclusions and master records
            const groupedEvents = new Map();
            validEvents.forEach((e) => {
                const uid = e.uid || e.event_id;
                if (!groupedEvents.has(uid))
                    groupedEvents.set(uid, []);
                groupedEvents.get(uid).push(e);
            });
            const upsertOps = [];
            for (const [uid, items] of groupedEvents.entries()) {
                // The "master" event is the one NOT marked as deleted
                const master = items.find((it) => it.estatus !== "deleted") || items[0];
                const deletedInstances = items.filter((it) => it.estatus === "deleted");
                const isAllDay = !!master.isallday;
                const isRecurring = !!(master.rrule || master.isrep);
                // Consolidate exclusions
                let exdates = [];
                if (master.exdate) {
                    exdates = typeof master.exdate === "string" ? master.exdate.split(",") : (Array.isArray(master.exdate) ? master.exdate : []);
                }
                deletedInstances.forEach((d) => {
                    if (d.recurrenceid && !exdates.includes(d.recurrenceid)) {
                        exdates.push(d.recurrenceid);
                    }
                });
                const deterministicId = `${req.user.tenantId}_${uid}`;
                upsertOps.push(database_1.prisma.zohoEvent.upsert({
                    where: { id: deterministicId },
                    create: {
                        id: deterministicId,
                        eventId: uid,
                        calendarId: user.zohoCalendarId,
                        tenantId: req.user.tenantId,
                        title: master.title || "Untitled",
                        description: master.description || null,
                        startTime: parseZohoDate(master.dateandtime?.start || master.startdatetime),
                        endTime: parseZohoDate(master.dateandtime?.end || master.enddatetime),
                        location: master.location || null,
                        userId: req.user.id,
                        isAllDay: !!isAllDay,
                        isRecurring: !!isRecurring,
                        rrule: master.rrule || null,
                        exdate: exdates.length > 0 ? exdates : null,
                        meetingLink: master.conference_data?.meetingdata?.meeting_link || master.app_data?.meetingdata?.meetinglink || null,
                    },
                    update: {
                        title: master.title || "Untitled",
                        description: master.description || null,
                        startTime: parseZohoDate(master.dateandtime?.start || master.startdatetime),
                        endTime: parseZohoDate(master.dateandtime?.end || master.enddatetime),
                        location: master.location || null,
                        isAllDay: !!isAllDay,
                        isRecurring: !!isRecurring,
                        rrule: master.rrule || null,
                        exdate: exdates.length > 0 ? exdates : null,
                        meetingLink: master.conference_data?.meetingdata?.meeting_link || master.app_data?.meetingdata?.meetinglink || null,
                        updatedById: req.user.id,
                    },
                }));
            }
            if (upsertOps.length > 0) {
                await database_1.prisma.$transaction(upsertOps);
            }
            // Update last sync time regardless of whether new events were found
            await database_1.prisma.user.update({
                where: { id: req.user.id },
                data: { zohoLastSync: new Date() }
            });
            res.status(200).json({
                success: true,
                data: { synced: zohoEvents.length, lastSync: new Date() },
                message: `Synced ${zohoEvents.length} events from Zoho Calendar`,
            });
        }
        catch (error) {
            console.error("Zoho sync error:", error?.response?.data || error);
            res.status(500).json({
                success: false,
                error: "Failed to sync Zoho events",
            });
        }
    }
}
exports.CalendarController = CalendarController;
//# sourceMappingURL=calendarcontroller.js.map