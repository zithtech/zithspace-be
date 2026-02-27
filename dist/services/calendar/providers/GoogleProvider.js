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
            singleEvents: true,
            orderBy: "startTime",
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
    async createEvent(accessToken, calendarId = "primary", eventData) {
        const payload = this.mapToGooglePayload(eventData);
        const response = await axios_1.default.post(`${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events`, payload, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        return response.data;
    }
    async updateEvent(accessToken, calendarId = "primary", externalId, eventData) {
        const payload = this.mapToGooglePayload(eventData);
        const response = await axios_1.default.put(`${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events/${externalId}`, payload, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        return response.data;
    }
    async deleteEvent(accessToken, calendarId = "primary", externalId, action, occurrenceDate) {
        await axios_1.default.delete(`${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events/${externalId}`, {
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
    mapToGooglePayload(data) {
        return {
            summary: data.title,
            description: data.description,
            location: data.location,
            start: data.isAllDay
                ? { date: data.startTime.toISOString().split("T")[0] }
                : { dateTime: data.startTime.toISOString() },
            end: data.isAllDay
                ? { date: data.endTime.toISOString().split("T")[0] }
                : { dateTime: data.endTime.toISOString() },
            recurrence: data.isRecurring && data.rrule ? [data.rrule] : undefined,
            attendees: data.attendees?.map(email => ({ email })),
            // conferenceData creation omitted for simplicity, but can be added
        };
    }
}
exports.GoogleProvider = GoogleProvider;
//# sourceMappingURL=GoogleProvider.js.map