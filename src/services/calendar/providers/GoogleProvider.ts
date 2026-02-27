import axios from "axios";
import { ICalendarProvider, CalendarEventData, ProviderAuthResult, ProviderTokenResult } from "../ICalendarProvider";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI!;
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export class GoogleProvider implements ICalendarProvider {
    getAuthUrl(userId: string): string {
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

    async handleCallback(code: string, state: string): Promise<ProviderAuthResult> {
        const params = new URLSearchParams({
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: GOOGLE_REDIRECT_URI,
            grant_type: "authorization_code",
        });

        const response = await axios.post(GOOGLE_TOKEN_URL, params.toString(), {
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

    async getEvents(accessToken: string, calendarId: string = "primary", startDate?: Date, endDate?: Date): Promise<any[]> {
        const params: any = {
            singleEvents: true,
            orderBy: "startTime",
        };
        if (startDate) params.timeMin = startDate.toISOString();
        if (endDate) params.timeMax = endDate.toISOString();

        const response = await axios.get(`${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params,
        });

        return response.data?.items || [];
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

    async createEvent(accessToken: string, calendarId: string, eventData: CalendarEventData): Promise<any> {
    console.log("🟢🟢🟢 GOOGLE PROVIDER - CREATE EVENT START 🟢🟢🟢");
    console.log("🟢 eventData received:", JSON.stringify(eventData, null, 2));
    console.log("🟢 generateMeeting value:", eventData.generateMeeting);
    console.log("🟢 generateMeeting type:", typeof eventData.generateMeeting);
    
    const payload = this.mapToGooglePayload(eventData);
    console.log("🟢 Payload being sent to Google:", JSON.stringify(payload, null, 2));
    
    const hasConference = !!payload.conferenceData;
    console.log("🟢 Has conference:", hasConference);
    
    try {
        const response = await axios.post(
            `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events`,
            payload,
            {
                headers: { 
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                params: hasConference ? { conferenceDataVersion: 1 } : {}
            }
        );
        
        console.log("🟢 Google API response status:", response.status);
        console.log("🟢 Google API response data:", JSON.stringify(response.data, null, 2));
        console.log("🟢 Hangout link:", response.data.hangoutLink);
        console.log("🟢🟢🟢 GOOGLE PROVIDER - CREATE EVENT END 🟢🟢🟢");
        
        return response.data;
    } catch (error) {
        console.error("🟢 Google API error:", error.response?.data || error.message);
        throw error;
    }
}

    async updateEvent(accessToken: string, calendarId: string = "primary", externalId: string, eventData: CalendarEventData): Promise<any> {
        const payload = this.mapToGooglePayload(eventData);
        const response = await axios.put(
            `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events/${externalId}`,
            payload,
            {
                headers: { Authorization: `Bearer ${accessToken}` },
            }
        );
        return response.data;
    }

    async deleteEvent(accessToken: string, calendarId: string = "primary", externalId: string, action?: number, occurrenceDate?: string): Promise<void> {
        await axios.delete(`${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events/${externalId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
    }

    async refreshToken(refreshToken: string): Promise<ProviderTokenResult> {
        const params = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        });

        const response = await axios.post(GOOGLE_TOKEN_URL, params.toString(), {
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

private mapToGooglePayload(data: CalendarEventData): any {
    // Convert string dates to Date objects if they're strings
    const startTime = typeof data.startTime === 'string' ? new Date(data.startTime) : data.startTime;
    const endTime = typeof data.endTime === 'string' ? new Date(data.endTime) : data.endTime;
    
    console.log("Mapping to Google payload:", {
        generateMeeting: data.generateMeeting,
        title: data.title
    });
    
    const payload: any = {
        summary: data.title,
        description: data.description,
        location: data.location,
        start: data.isAllDay
            ? { date: startTime.toISOString().split("T")[0] }
            : { dateTime: startTime.toISOString() },
        end: data.isAllDay
            ? { date: endTime.toISOString().split("T")[0] }
            : { dateTime: endTime.toISOString() },
        recurrence: data.isRecurring && data.rrule ? [data.rrule] : undefined,
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
}
