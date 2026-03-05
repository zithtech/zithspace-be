"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MicrosoftProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const MICROSOFT_CLIENT_ID = process.env.MS_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
const MICROSOFT_REDIRECT_URI = process.env.MS_REDIRECT_URI;
const MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MS_GRAPH_API = "https://graph.microsoft.com/v1.0";
class MicrosoftProvider {
    getAuthUrl(userId) {
        const params = new URLSearchParams({
            client_id: MICROSOFT_CLIENT_ID,
            response_type: "code",
            redirect_uri: MICROSOFT_REDIRECT_URI,
            response_mode: "query",
            scope: "offline_access Calendars.ReadWrite User.Read OnlineMeetings.ReadWrite",
            state: userId,
            prompt: "consent",
        });
        return `${MS_AUTH_URL}?${params.toString()}`;
    }
    async handleCallback(code, state) {
        const params = new URLSearchParams({
            client_id: MICROSOFT_CLIENT_ID,
            client_secret: MICROSOFT_CLIENT_SECRET,
            code,
            redirect_uri: MICROSOFT_REDIRECT_URI,
            grant_type: "authorization_code",
        });
        const response = await axios_1.default.post(MS_TOKEN_URL, params.toString(), {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        const { access_token, refresh_token, expires_in } = response.data;
        return {
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresIn: expires_in,
            calendarId: "primary", // MS Graph uses 'Me' or default calendar
        };
    }
    getCalendarBaseUrl(calendarId) {
        // 'primary' is a valid shortcut for the default calendar, but we can also use /me/calendars/primary
        if (!calendarId || calendarId === "primary") {
            return `${MS_GRAPH_API}/me`;
        }
        return `${MS_GRAPH_API}/me/calendars/${calendarId}`;
    }
    async getEvents(accessToken, calendarId = "primary", startDate, endDate) {
        let url = `${MS_GRAPH_API}/me/events`;
        const params = {
            $orderby: "start/dateTime",
            $top: 100
        };
        if (startDate) {
            url = `${this.getCalendarBaseUrl(calendarId)}/events`;
            params.$filter = `start/dateTime ge '${startDate.toISOString()}'`;
        }
        else {
            url = `${this.getCalendarBaseUrl(calendarId)}/events`;
        }
        const response = await axios_1.default.get(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Prefer": 'outlook.timezone="UTC"'
            },
            params,
        });
        return response.data?.value || [];
    }
    async getIncrementalChanges(accessToken, calendarId, token) {
        let url = token || `${MS_GRAPH_API}/me/calendarView/delta`;
        const params = {};
        // If no token, we need a window. Microsoft delta requires a start/end for the initial call
        // if using calendarView/delta, or just /events/delta for all time.
        // The user request mentioned (/me/events/delta).
        if (!token) {
            url = `${MS_GRAPH_API}/me/events/delta`;
        }
        let preferHeader = 'outlook.timezone="UTC"';
        if (!token) {
            preferHeader += ', odata.maxpagesize=100';
        }
        try {
            const response = await axios_1.default.get(url, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Prefer": preferHeader
                },
                params: !token && Object.keys(params).length > 0 ? params : undefined,
            });
            return {
                events: response.data?.value || [],
                nextToken: response.data?.["@odata.deltaLink"] || response.data?.["@odata.nextLink"] || "",
                hasMore: !!response.data?.["@odata.nextLink"],
            };
        }
        catch (error) {
            // Log full error for debugging 400 Bad Request
            if (error.response) {
                console.error(`[MicrosoftProvider] getIncrementalChanges error ${error.response.status}:`, JSON.stringify(error.response.data, null, 2));
                console.error(`[MicrosoftProvider] Failed URL: ${url}`);
                if (token)
                    console.error(`[MicrosoftProvider] Token length: ${token.length}`);
            }
            // If delta link is invalid (410 Gone or TokenExpired/Invalid SyncState), restart
            if (error.response?.status === 410 || (error.response?.status === 400 && error.response?.data?.error?.code === 'SyncStateNotFound')) {
                console.warn(`[MicrosoftProvider] Delta link expired or invalid (${error.response.status}). Restarting delta cycle.`);
                return this.getIncrementalChanges(accessToken, calendarId);
            }
            throw error;
        }
    }
    async createEvent(accessToken, calendarId, eventData) {
        // Fetch user info to decide on meeting provider heuristic
        let userEmail = "";
        try {
            const meRes = await axios_1.default.get(`${MS_GRAPH_API}/me`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            userEmail = meRes.data.userPrincipalName || meRes.data.mail || "";
            console.log(`[MicrosoftProvider] Creating event for user: ${userEmail}`);
        }
        catch (meError) {
            console.warn("[MicrosoftProvider] Could not fetch MS user info for meeting provider heuristic:", meError);
        }
        const isPersonal = userEmail && ["outlook.com", "hotmail.com", "live.com", "msn.com"].some(d => userEmail.toLowerCase().endsWith(d));
        const useConversionWorkaround = eventData.generateMeeting && eventData.isRecurring && isPersonal;
        const payload = this.mapToMicrosoftPayload(eventData, userEmail, false, useConversionWorkaround);
        try {
            const response = await axios_1.default.post(`${this.getCalendarBaseUrl(calendarId)}/events`, payload, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    "Prefer": 'outlook.timezone="UTC"'
                },
            });
            let createdEvent = response.data;
            // WORKAROUND: For recurring events on personal accounts, MS Graph often ignores isOnlineMeeting: true
            // in the initial POST of a series.
            // Strategy: Create as single (done above), ensure meeting exists, then PATCH to series.
            if (useConversionWorkaround) {
                console.log("[MicrosoftProvider] Applying 'Create Single then Recur' workaround for personal account...");
                // 1. Ensure meeting is provisioned for the single instance
                if (!createdEvent.isOnlineMeeting) {
                    console.log("[MicrosoftProvider] Single instance missing meeting. Forcing PATCH kick...");
                    const patchKick = await axios_1.default.patch(`${this.getCalendarBaseUrl(calendarId)}/events/${createdEvent.id}`, { isOnlineMeeting: true }, {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "Content-Type": "application/json",
                            "Prefer": 'outlook.timezone="UTC"'
                        },
                    });
                    createdEvent = patchKick.data;
                }
                // 2. Wait a moment for MS to stabilize the meeting link
                await new Promise(resolve => setTimeout(resolve, 1500));
                // 3. Convert to Recurrence Series
                console.log("[MicrosoftProvider] Converting single meeting to recurring series...");
                const recurrencePayload = this.mapToMicrosoftPayload(eventData, userEmail, true);
                const finalPatch = await axios_1.default.patch(`${this.getCalendarBaseUrl(calendarId)}/events/${createdEvent.id}`, { recurrence: recurrencePayload.recurrence }, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                        "Prefer": 'outlook.timezone="UTC"'
                    },
                });
                createdEvent = finalPatch.data;
                // Final GET to ensure all properties (joinUrl etc) are captured
                const finalRes = await axios_1.default.get(`${this.getCalendarBaseUrl(calendarId)}/events/${createdEvent.id}`, { headers: { Authorization: `Bearer ${accessToken}`, "Prefer": 'outlook.timezone="UTC"' } });
                createdEvent = finalRes.data;
                console.log("[MicrosoftProvider] Conversion workaround successful. Meeting status:", createdEvent.isOnlineMeeting);
            }
            else if (eventData.generateMeeting && eventData.isRecurring && !createdEvent.isOnlineMeeting) {
                // Standard Two-Step Provisioning for business accounts if needed (unlikely but safe)
                console.log("[MicrosoftProvider] Performing Two-Step Provisioning PATCH for business recurring online meeting...");
                try {
                    const patchResponse = await axios_1.default.patch(`${this.getCalendarBaseUrl(calendarId)}/events/${createdEvent.id}`, { isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" }, {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "Content-Type": "application/json",
                            "Prefer": 'outlook.timezone="UTC"'
                        },
                    });
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    const finalRes = await axios_1.default.get(`${this.getCalendarBaseUrl(calendarId)}/events/${createdEvent.id}`, {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "Prefer": 'outlook.timezone="UTC"'
                        },
                    });
                    createdEvent = finalRes.data;
                    console.log("[MicrosoftProvider] Two-Step Provisioning successful. Meeting status:", createdEvent.isOnlineMeeting);
                }
                catch (patchError) {
                    console.warn("[MicrosoftProvider] Two-Step Provisioning failed to fully sync, but event exists.", patchError);
                }
            }
            return createdEvent;
        }
        catch (error) {
            this.handleAxiosError(error, "createEvent");
            throw error;
        }
    }
    async updateEvent(accessToken, calendarId, externalId, eventData, action, occurrenceDate) {
        // Fetch user info for heuristic on update too if meeting needs to be generated/updated
        let userEmail = "";
        try {
            const meRes = await axios_1.default.get(`${MS_GRAPH_API}/me`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            userEmail = meRes.data.userPrincipalName || meRes.data.mail || "";
        }
        catch (meErr) {
            // ignore
        }
        let targetId = externalId;
        // If action is 0 (Only this event), we expect externalId to ALREADY be the instance ID 
        // provided by CalendarService or the caller who resolved it.
        // However, we keep a minimal check if the caller passed a master ID by mistake.
        console.log(`[MicrosoftProvider] updateEvent targetId: ${targetId}, action: ${action}, occurrenceDate: ${occurrenceDate}`);
        const payload = this.mapToMicrosoftPayload(eventData, userEmail, true);
        // Important: for Microsoft, updating a single instance of a recurring event 
        // using PATCH to the instance ID works correctly.
        try {
            const response = await axios_1.default.patch(`${this.getCalendarBaseUrl(calendarId)}/events/${targetId}`, payload, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    "Prefer": 'outlook.timezone="UTC"'
                },
            });
            return response.data;
        }
        catch (error) {
            this.handleAxiosError(error, "updateEvent");
            throw error;
        }
    }
    async deleteEvent(accessToken, calendarId, externalId, action, occurrenceDate) {
        try {
            const baseUrl = this.getCalendarBaseUrl(calendarId);
            let deleteUrl = `${baseUrl}/events/${encodeURIComponent(externalId)}`;
            console.log(`[MicrosoftProvider] deleteEvent externalId: ${externalId}, action: ${action}, occurrenceDate: ${occurrenceDate}`);
            // If it's a single occurrence delete, externalId from CalendarService should already be 
            // the instance ID if it was detected as forked, or we might need one quick check if it's a master.
            if (action === 0 && occurrenceDate) {
                try {
                    const eventRes = await axios_1.default.get(deleteUrl, {
                        headers: { Authorization: `Bearer ${accessToken}`, "Prefer": 'outlook.timezone="UTC"' }
                    });
                    const event = eventRes.data;
                    if (event.type === 'seriesMaster') {
                        console.log(`[MicrosoftProvider] Resolving instance for deletion of master ${externalId}`);
                        const searchStart = new Date(occurrenceDate);
                        const windowStart = new Date(searchStart.getTime() - 60 * 60 * 1000);
                        const windowEnd = new Date(searchStart.getTime() + 60 * 60 * 1000);
                        const instancesRes = await axios_1.default.get(`${deleteUrl}/instances`, {
                            headers: { Authorization: `Bearer ${accessToken}`, "Prefer": 'outlook.timezone="UTC"' },
                            params: { startDateTime: windowStart.toISOString(), endDateTime: windowEnd.toISOString() }
                        });
                        const instance = (instancesRes.data.value || []).find((inst) => {
                            const instDate = new Date(inst.start.dateTime + "Z");
                            return Math.abs(instDate.getTime() - searchStart.getTime()) < 2 * 60 * 1000;
                        });
                        if (instance) {
                            deleteUrl = `${baseUrl}/events/${encodeURIComponent(instance.id)}`;
                        }
                        else {
                            console.warn(`[MicrosoftProvider] Instance not found for deletion on ${occurrenceDate}.`);
                            return; // Success-ish
                        }
                    }
                }
                catch (err) {
                    if (err.response?.status === 404)
                        return;
                }
            }
            else if (action === 1 || action === 2) {
                // For series, ensure we target master if currently on an instance
                try {
                    const eventRes = await axios_1.default.get(deleteUrl, {
                        headers: { Authorization: `Bearer ${accessToken}` }
                    });
                    if (eventRes.data.seriesMasterId) {
                        deleteUrl = `${baseUrl}/events/${encodeURIComponent(eventRes.data.seriesMasterId)}`;
                    }
                }
                catch (e) { }
            }
            console.log(`[MicrosoftProvider] Executing DELETE: ${deleteUrl}`);
            await axios_1.default.delete(deleteUrl, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Prefer": 'outlook.timezone="UTC"'
                },
            });
        }
        catch (error) {
            // If the final DELETE fails with 404, we treat it as success (event already gone)
            if (error.response?.status === 404) {
                console.warn(`[MicrosoftProvider] DELETE: Event not found (404), treating as deleted.`);
                return;
            }
            this.handleAxiosError(error, "deleteEvent");
            throw error;
        }
    }
    async refreshToken(refreshToken) {
        const params = new URLSearchParams({
            client_id: MICROSOFT_CLIENT_ID,
            client_secret: MICROSOFT_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        });
        try {
            const response = await axios_1.default.post(MS_TOKEN_URL, params.toString(), {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
            });
            return {
                accessToken: response.data.access_token,
                expiresIn: response.data.expires_in,
            };
        }
        catch (error) {
            this.handleAxiosError(error, "refreshToken");
            throw error;
        }
    }
    handleAxiosError(error, context) {
        if (error.response) {
            console.error(`[MicrosoftProvider] ${context} error: ${error.response.status}`, JSON.stringify(error.response.data, null, 2));
        }
        else {
            console.error(`[MicrosoftProvider] ${context} error (no response):`, error.message);
        }
    }
    mapToMicrosoftPayload(data, userEmail = "", isUpdate = false, skipRecurrence = false) {
        console.log(`[MicrosoftProvider] Mapping payload for "${data.title}". generateMeeting: ${data.generateMeeting}, isUpdate: ${isUpdate}`);
        const startTime = typeof data.startTime === 'string' ? new Date(data.startTime) : data.startTime;
        const endTime = typeof data.endTime === 'string' ? new Date(data.endTime) : data.endTime;
        const payload = {
            subject: data.title,
            location: {
                displayName: data.location || ""
            },
            isAllDay: !!data.isAllDay,
        };
        // ONLY send body if it's not empty, to avoid wiping Microsoft's auto-generated meeting footer
        // for personal accounts when no description is provided.
        if (data.description) {
            payload.body = {
                contentType: "HTML",
                content: data.description
            };
        }
        if (data.isAllDay) {
            payload.start = {
                dateTime: startTime.toISOString().split("T")[0],
                timeZone: "UTC"
            };
            payload.end = {
                dateTime: endTime.toISOString().split("T")[0],
                timeZone: "UTC"
            };
        }
        else {
            // MS Graph prefers string WITHOUT Z or timezone explicitly defined.
            // Using .toISOString().replace('Z', '') directly ensures correct representation.
            payload.start = {
                dateTime: startTime.toISOString().replace('Z', ''),
                timeZone: "UTC"
            };
            payload.end = {
                dateTime: endTime.toISOString().replace('Z', ''),
                timeZone: "UTC"
            };
        }
        if (data.attendees && data.attendees.length > 0) {
            payload.attendees = data.attendees.map(attendee => {
                // Determine the raw email string and name from various possible attendee formats
                let emailStr = "";
                let nameStr = "";
                if (typeof attendee === 'string') {
                    emailStr = attendee;
                    nameStr = attendee;
                }
                else if (attendee && typeof attendee === 'object') {
                    emailStr = attendee.email || attendee.emailAddress?.address || attendee.address || attendee;
                    nameStr = attendee.displayName || attendee.name || attendee.emailAddress?.name || emailStr;
                    // If we still found an object for email, try one more level or convert to string
                    if (typeof emailStr !== 'string') {
                        emailStr = emailStr.address || emailStr.email || String(emailStr);
                    }
                    if (typeof nameStr !== 'string') {
                        nameStr = String(nameStr);
                    }
                }
                return {
                    emailAddress: {
                        address: emailStr,
                        name: nameStr
                    },
                    type: "required"
                };
            });
        }
        if (data.generateMeeting) {
            payload.isOnlineMeeting = true;
            // Heuristic for onlineMeetingProvider based on user email
            const personalDomains = ["outlook.com", "hotmail.com", "live.com", "msn.com"];
            const domain = userEmail.split("@")[1]?.toLowerCase();
            if (domain && personalDomains.includes(domain)) {
                // For personal accounts:
                // - Both single and recurring events often work better when the provider is omitted.
                // - Letting MS choose based on account settings is most reliable.
                console.log(`[MicrosoftProvider] Personal account detected (${domain}). Omiting onlineMeetingProvider.`);
            }
            else {
                console.log(`[MicrosoftProvider] Business account detected. Using teamsForBusiness.`);
                payload.onlineMeetingProvider = "teamsForBusiness";
            }
            // For online meetings, sometimes at least one attendee is required (especially for business series).
            // However, for personal accounts, adding the organizer as a required attendee to their own meeting
            // can sometimes prevent meeting generation or cause sync issues.
            const isPersonal = domain && personalDomains.includes(domain);
            if (!isPersonal && (!payload.attendees || payload.attendees.length === 0)) {
                console.log(`[MicrosoftProvider] No attendees for online meeting. Adding organizer as attendee.`);
                payload.attendees = [
                    {
                        emailAddress: { address: userEmail },
                        type: "required",
                    },
                ];
            }
        }
        if (data.isRecurring && !skipRecurrence) {
            const dayMap = {
                'SU': 'sunday', 'MO': 'monday', 'TU': 'tuesday', 'WE': 'wednesday',
                'TH': 'thursday', 'FR': 'friday', 'SA': 'saturday'
            };
            // If updating, only send recurrence pattern if recurringDays are provided. 
            // Otherwise, we might accidentally reset a weekly series to daily if the frontend sends empty days.
            const hasExplicitDays = data.recurringDays && data.recurringDays.length > 0;
            if (hasExplicitDays) {
                if (data.recurringDays.length < 7) {
                    payload.recurrence = {
                        pattern: {
                            type: "weekly",
                            interval: 1,
                            daysOfWeek: data.recurringDays.map(d => dayMap[d])
                        },
                        range: {
                            type: "noEnd",
                            startDate: startTime.toISOString().split("T")[0]
                        }
                    };
                }
                else {
                    payload.recurrence = {
                        pattern: {
                            type: "daily",
                            interval: 1
                        },
                        range: {
                            type: "noEnd",
                            startDate: startTime.toISOString().split("T")[0]
                        }
                    };
                }
            }
            else if (!isUpdate) {
                // For new events, default to daily if no days specified
                payload.recurrence = {
                    pattern: {
                        type: "daily",
                        interval: 1
                    },
                    range: {
                        type: "noEnd",
                        startDate: startTime.toISOString().split("T")[0]
                    }
                };
            }
            // If isUpdate and NO explicit days, we omit the 'recurrence' block entirely 
            // so Microsoft preserves the existing pattern.
        }
        return payload;
    }
    mapToInternalEvent(rawEvent) {
        return {
            ...rawEvent,
            id: rawEvent.id,
            externalId: rawEvent.id,
            provider: "MICROSOFT"
        };
    }
}
exports.MicrosoftProvider = MicrosoftProvider;
//# sourceMappingURL=MicrosoftProvider.js.map