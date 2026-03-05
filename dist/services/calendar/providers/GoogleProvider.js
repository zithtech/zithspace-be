"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
class GoogleProvider {
    getAuthUrl(userId) {
        const params = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            redirect_uri: GOOGLE_REDIRECT_URI,
            response_type: "code",
            scope: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events",
            access_type: "offline",
            prompt: "consent",
            state: userId,
        });
        return `${GOOGLE_AUTH_URL}?${params.toString()}`;
    }
    async handleCallback(code, state) {
        const params = new URLSearchParams({
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: GOOGLE_REDIRECT_URI,
            grant_type: "authorization_code",
        });
        const response = await axios_1.default.post(GOOGLE_TOKEN_URL, params.toString(), {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        const { access_token, refresh_token, expires_in } = response.data;
        return {
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresIn: expires_in,
            calendarId: "primary",
        };
    }
    async getEvents(accessToken, calendarId = "primary", startDate, endDate) {
        const params = {
            singleEvents: false,
        };
        if (startDate)
            params.timeMin = startDate.toISOString();
        if (endDate)
            params.timeMax = endDate.toISOString();
        const response = await axios_1.default.get(`${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params,
        });
        return response.data?.items || [];
    }
    async getIncrementalChanges(accessToken, calendarId, token) {
        const params = {
            singleEvents: false,
            maxResults: 250,
            showDeleted: true,
        };
        if (token) {
            if (token.startsWith("page:")) {
                params.pageToken = token.replace("page:", "");
            }
            else {
                params.syncToken = token.startsWith("sync:") ? token.replace("sync:", "") : token;
            }
        }
        try {
            const response = await axios_1.default.get(`${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                params,
            });
            const nextToken = response.data.nextPageToken
                ? `page:${response.data.nextPageToken}`
                : (response.data.nextSyncToken ? `sync:${response.data.nextSyncToken}` : "");
            return {
                events: response.data?.items || [],
                nextToken: nextToken,
                hasMore: !!response.data.nextPageToken,
            };
        }
        catch (error) {
            if (error.response?.status === 410) {
                console.warn(`[GoogleProvider] Sync token expired (410). Performing full resync.`);
                // Return empty token to trigger full sync (recursive call without token)
                return this.getIncrementalChanges(accessToken, calendarId);
            }
            throw error;
        }
    }
    // async createEvent(accessToken: string, calendarId: string = "primary", eventData: CalendarEventData): Promise<any> {
    //     const payload = this.mapToGooglePayload(eventData);
    //     const response = await axios.post(
    //         `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events`,
    //         payload,
    //         {
    //             headers: { Authorization: `Bearer ${accessToken}` },
    //         }
    //     );
    //     return response.data;
    // }
    async createEvent(accessToken, calendarId, eventData) {
        console.log("🟢🟢🟢 GOOGLE PROVIDER - CREATE EVENT START 🟢🟢🟢");
        console.log("🟢 eventData received:", JSON.stringify(eventData, null, 2));
        console.log("🟢 generateMeeting value:", eventData.generateMeeting);
        console.log("🟢 generateMeeting type:", typeof eventData.generateMeeting);
        const payload = this.mapToGooglePayload(eventData);
        console.log("🟢 Payload being sent to Google:", JSON.stringify(payload, null, 2));
        const hasConference = !!payload.conferenceData;
        console.log("🟢 Has conference:", hasConference);
        try {
            const response = await axios_1.default.post(`${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events`, payload, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                params: hasConference ? { conferenceDataVersion: 1 } : {}
            });
            console.log("🟢 Google API response status:", response.status);
            console.log("🟢 Google API response data:", JSON.stringify(response.data, null, 2));
            console.log("🟢 Hangout link:", response.data.hangoutLink);
            console.log("🟢🟢🟢 GOOGLE PROVIDER - CREATE EVENT END 🟢🟢🟢");
            return response.data;
        }
        catch (error) {
            console.error("🟢 Google API error:", error.response?.data || error.message);
            throw error;
        }
    }
    async updateEvent(accessToken, calendarId = "primary", externalId, eventData, action, occurrenceDate) {
        let targetId = externalId;
        if (action === 0 && occurrenceDate) {
            try {
                // For single occurrence update, we need to find the instance ID
                const searchStart = new Date(occurrenceDate);
                const instancesRes = await axios_1.default.get(`${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events/${externalId}/instances`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    params: {
                        timeMin: new Date(searchStart.getTime() - 60000).toISOString(),
                        timeMax: new Date(searchStart.getTime() + 60000).toISOString(),
                    }
                });
                const occurrences = instancesRes.data.items || [];
                const instance = occurrences.find((inst) => {
                    const instStart = new Date(inst.start.dateTime || inst.start.date);
                    return Math.abs(instStart.getTime() - searchStart.getTime()) < 2 * 60 * 1000;
                });
                if (instance) {
                    targetId = instance.id;
                }
                else {
                    console.warn(`[GoogleProvider] No instance found for ${occurrenceDate} to update. Local DB will still be updated.`);
                    // Ideally we might want to throw here, but we'll try updating the master if instance not found
                }
            }
            catch (err) {
                console.warn(`[GoogleProvider] Error finding instance for update:`, err.message);
            }
        }
        const payload = this.mapToGooglePayload(eventData, action === 0);
        const response = await axios_1.default.put(`${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events/${targetId}`, payload, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        return response.data;
    }
    async deleteEvent(accessToken, calendarId = "primary", externalId, action, occurrenceDate) {
        let targetId = externalId;
        if (action === 0 && occurrenceDate) {
            try {
                // For single occurrence deletion, we need to find the instance ID
                const searchStart = new Date(occurrenceDate);
                const instancesRes = await axios_1.default.get(`${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events/${externalId}/instances`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    params: {
                        timeMin: new Date(searchStart.getTime() - 60000).toISOString(),
                        timeMax: new Date(searchStart.getTime() + 60000).toISOString(),
                    }
                });
                const occurrences = instancesRes.data.items || [];
                const instance = occurrences.find((inst) => {
                    const instStart = new Date(inst.start.dateTime || inst.start.date);
                    return Math.abs(instStart.getTime() - searchStart.getTime()) < 2 * 60 * 1000;
                });
                if (instance) {
                    targetId = instance.id;
                }
                else {
                    console.warn(`[GoogleProvider] No instance found for ${occurrenceDate}. Local DB will still be updated.`);
                    return;
                }
            }
            catch (err) {
                if (err.response?.status === 404)
                    return; // Master already gone
                throw err;
            }
        }
        await axios_1.default.delete(`${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events/${targetId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
    }
    async refreshToken(refreshToken) {
        const params = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        });
        const response = await axios_1.default.post(GOOGLE_TOKEN_URL, params.toString(), {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        return {
            accessToken: response.data.access_token,
            expiresIn: response.data.expires_in,
        };
    }
    // private mapToGooglePayload(data: CalendarEventData): any {
    //     return {
    //         summary: data.title,
    //         description: data.description,
    //         location: data.location,
    //         start: data.isAllDay
    //             ? { date: data.startTime.toISOString().split("T")[0] }
    //             : { dateTime: data.startTime.toISOString() },
    //         end: data.isAllDay
    //             ? { date: data.endTime.toISOString().split("T")[0] }
    //             : { dateTime: data.endTime.toISOString() },
    //         recurrence: data.isRecurring && data.rrule ? [data.rrule] : undefined,
    //         attendees: data.attendees?.map(email => ({ email })),
    //         // conferenceData creation omitted for simplicity, but can be added
    //     };
    // }
    //     private mapToGooglePayload(data: CalendarEventData): any {
    //     // Convert string dates to Date objects if they're strings
    //     const startTime = typeof data.startTime === 'string' ? new Date(data.startTime) : data.startTime;
    //     const endTime = typeof data.endTime === 'string' ? new Date(data.endTime) : data.endTime;
    //     return {
    //         summary: data.title,
    //         description: data.description,
    //         location: data.location,
    //         start: data.isAllDay
    //             ? { date: startTime.toISOString().split("T")[0] }
    //             : { dateTime: startTime.toISOString() },
    //         end: data.isAllDay
    //             ? { date: endTime.toISOString().split("T")[0] }
    //             : { dateTime: endTime.toISOString() },
    //         recurrence: data.isRecurring && data.rrule ? [data.rrule] : undefined,
    //         attendees: data.attendees?.map(email => ({ email })),
    //     };
    // }
    mapToGooglePayload(data, isInstance = false) {
        // Convert string dates to Date objects if they're strings
        const startTime = typeof data.startTime === 'string' ? new Date(data.startTime) : data.startTime;
        const endTime = typeof data.endTime === 'string' ? new Date(data.endTime) : data.endTime;
        console.log(`[GoogleProvider] Mapping to Google payload for: "${data.title}"`);
        console.log(`[GoogleProvider] Input RRule: "${data.rrule}"`);
        const payload = {
            summary: data.title,
            description: data.description || "",
            location: data.location || "",
            start: data.isAllDay
                ? { date: startTime.toISOString().split("T")[0] }
                : { dateTime: startTime.toISOString(), timeZone: "UTC" },
            end: data.isAllDay
                ? { date: endTime.toISOString().split("T")[0] }
                : { dateTime: endTime.toISOString(), timeZone: "UTC" },
            recurrence: (data.isRecurring && !isInstance)
                ? (data.recurringDays && data.recurringDays.length > 0
                    ? [`RRULE:FREQ=WEEKLY;BYDAY=${data.recurringDays.map(d => typeof d === 'string' ? d.replace(/[^A-Z]/g, '') : d).filter(d => !!d).join(",")}${data.generateMeeting ? ";COUNT=50" : ""}`]
                    : (data.rrule
                        ? (() => {
                            const raw = data.rrule.trim();
                            console.log(`[GoogleProvider] Processing RRule block: raw="${raw}"`);
                            let parsed;
                            try {
                                parsed = (raw.startsWith('[') || raw.startsWith('{')) ? JSON.parse(raw) : [raw];
                            }
                            catch (e) {
                                parsed = [raw];
                            }
                            // Sanitation: Ensure elements are clean strings
                            const cleaned = (Array.isArray(parsed) ? parsed : [parsed]).map(r => {
                                if (typeof r !== 'string')
                                    return r;
                                return r.replace(/[\\\"\]]+$/, '').trim();
                            }).filter(r => !!r && r.startsWith('RRULE:'));
                            console.log(`[GoogleProvider] Final recurrence array:`, cleaned);
                            return cleaned.length > 0 ? cleaned : [`RRULE:FREQ=DAILY;INTERVAL=1` + (data.generateMeeting ? ";COUNT=50" : "")];
                        })()
                        : [`RRULE:FREQ=DAILY;INTERVAL=1${data.generateMeeting ? ";COUNT=50" : ""}`]))
                : undefined,
            attendees: data.attendees?.map(email => ({ email })),
        };
        // Add Google Meet link if requested
        if (data.generateMeeting) {
            console.log("✅ Adding Google Meet link to event");
            payload.conferenceData = {
                createRequest: {
                    requestId: `${Date.now()}_${Math.random().toString(36).substring(7)}`,
                    conferenceSolutionKey: { type: "hangoutsMeet" }
                }
            };
        }
        return payload;
    }
    mapToInternalEvent(rawEvent) {
        return {
            ...rawEvent,
            id: rawEvent.id, // DO NOT prefix here, it double-prefixes in sync loop
            externalId: rawEvent.id,
            provider: "GOOGLE"
        };
    }
}
exports.GoogleProvider = GoogleProvider;
//# sourceMappingURL=GoogleProvider.js.map