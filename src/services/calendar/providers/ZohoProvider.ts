import axios from "axios";
import { ICalendarProvider, CalendarEventData, ProviderAuthResult, ProviderTokenResult } from "../ICalendarProvider";

const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID!;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET!;
const ZOHO_REDIRECT_URI = process.env.ZOHO_REDIRECT_URI!;
const ZOHO_AUTH_URL = "https://accounts.zoho.in/oauth/v2/auth";
const ZOHO_TOKEN_URL = "https://accounts.zoho.in/oauth/v2/token";
const ZOHO_CALENDAR_API = "https://calendar.zoho.in/api/v1";

export class ZohoProvider implements ICalendarProvider {
    getAuthUrl(userId: string): string {
        const params = new URLSearchParams({
            response_type: "code",
            client_id: ZOHO_CLIENT_ID,
            redirect_uri: ZOHO_REDIRECT_URI,
            scope: "ZohoCalendar.calendar.all,ZohoCalendar.event.all,ZohoMeeting.meeting.ALL",
            access_type: "offline",
            prompt: "consent",
            state: userId,
        });
        return `${ZOHO_AUTH_URL}?${params.toString()}`;
    }

    async handleCallback(code: string, state: string): Promise<ProviderAuthResult> {
        const params = new URLSearchParams({
            code,
            client_id: ZOHO_CLIENT_ID,
            client_secret: ZOHO_CLIENT_SECRET,
            redirect_uri: ZOHO_REDIRECT_URI,
            grant_type: "authorization_code",
        });

        const tokenResponse = await axios.post(`${ZOHO_TOKEN_URL}?${params.toString()}`);
        const { access_token, refresh_token: new_refresh_token, expires_in } = tokenResponse.data;

        if (!access_token) {
            throw new Error("Token exchange failed");
        }

        let calendarId: string | undefined;
        try {
            const calResponse = await axios.get(`${ZOHO_CALENDAR_API}/calendars`, {
                headers: { Authorization: `Zoho-oauthtoken ${access_token}` },
            });
            const calendars: any[] = calResponse.data?.calendars || [];
            const defaultCal = calendars.find((c: any) => c.isdefault) || calendars[0];
            calendarId = defaultCal?.uid;
        } catch (calErr) {
            console.warn("Could not fetch Zoho calendars:", calErr);
        }

        return {
            accessToken: access_token,
            refreshToken: new_refresh_token,
            expiresIn: expires_in || 3600,
            calendarId,
        };
    }

    async getEvents(accessToken: string, calendarId: string, startDate?: Date, endDate?: Date): Promise<any[]> {
        // Zoho V1 list endpoint does NOT support date filtering (causes EXTRA_PARAM_FOUND)
        const response = await axios.get(
            `${ZOHO_CALENDAR_API}/calendars/${calendarId}/events`,
            { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } }
        );
        return response.data?.events || [];
    }

    async createEvent(accessToken: string, calendarId: string, eventData: CalendarEventData): Promise<any> {
        const payload = this.mapToZohoPayload(eventData);
        const formBody = new URLSearchParams();
        formBody.append("eventdata", JSON.stringify(payload));

        const response = await axios.post(
            `${ZOHO_CALENDAR_API}/calendars/${calendarId}/events`,
            formBody,
            {
                headers: {
                    Authorization: `Zoho-oauthtoken ${accessToken}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }
        );
        return response.data?.events?.[0];
    }

    async updateEvent(accessToken: string, calendarId: string, externalId: string, eventData: CalendarEventData): Promise<any> {
        const eventUrl = `${ZOHO_CALENDAR_API}/calendars/${calendarId}/events/${externalId}`;
        const getRes = await axios.get(eventUrl, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        });
        const etag = getRes.data?.events?.find((e: any) => e.etag)?.etag;
        if (!etag) throw new Error("Could not retrieve event ETag");

        const payload = {
            ...this.mapToZohoPayload(eventData),
            etag,
        };

        const formBody = new URLSearchParams();
        formBody.append("eventdata", JSON.stringify(payload));

        const response = await axios.put(eventUrl, formBody, {
            headers: {
                Authorization: `Zoho-oauthtoken ${accessToken}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
        });
        return response.data?.events?.[0];
    }

    async deleteEvent(accessToken: string, calendarId: string, externalId: string, action?: number, occurrenceDate?: string): Promise<void> {
        const eventUrl = `${ZOHO_CALENDAR_API}/calendars/${calendarId}/events/${externalId}`;
        const getRes = await axios.get(eventUrl, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        });
        const etag = getRes.data?.events?.find((e: any) => e.etag || e.event_id === externalId)?.etag;

        let deleteUrl = eventUrl;
        if (action !== undefined) {
            const params = new URLSearchParams();
            params.append("action", action.toString());
            if (occurrenceDate) {
                // Convert ISO to Zoho format yyyyMMddTHHmmssZ if needed
                const zohoOcc = occurrenceDate.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
                params.append("occurrence_date", zohoOcc);
            }
            deleteUrl += `?${params.toString()}`;
        }

        const deleteData: any = {};
        if (etag) deleteData.etag = etag;

        const deleteBody = new URLSearchParams();
        deleteBody.append("eventdata", JSON.stringify(deleteData));

        await axios.delete(deleteUrl, {
            headers: {
                Authorization: `Zoho-oauthtoken ${accessToken}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data: deleteBody,
        });
    }

    async refreshToken(refreshToken: string): Promise<ProviderTokenResult> {
        const params = new URLSearchParams({
            refresh_token: refreshToken,
            client_id: ZOHO_CLIENT_ID,
            client_secret: ZOHO_CLIENT_SECRET,
            grant_type: "refresh_token",
        });

        const response = await axios.post(`${ZOHO_TOKEN_URL}?${params.toString()}`);
        const { access_token, expires_in } = response.data;

        if (!access_token) {
            throw new Error("Failed to refresh Zoho access token");
        }

        return {
            accessToken: access_token,
            expiresIn: expires_in || 3600,
        };
    }

    private mapToZohoPayload(data: CalendarEventData): any {
        return {
            title: data.title,
            description: data.description || "",
            dateandtime: {
                start: this.toZohoDate(data.startTime, !!data.isAllDay),
                end: this.toZohoDate(data.endTime, !!data.isAllDay),
                timezone: data.isAllDay ? undefined : "Asia/Kolkata",
            },
            location: data.location || "",
            isallday: !!data.isAllDay,
            isrep: !!data.isRecurring,
            rrule: data.isRecurring ? (data.generateMeeting ? "FREQ=DAILY;INTERVAL=1;COUNT=50" : "FREQ=DAILY;INTERVAL=1") : undefined,
            conference: data.generateMeeting ? "zmeeting" : undefined,
            attendees: data.attendees?.map(email => ({ email })),
        };
    }

    private toZohoDate(iso: string | Date, allDay: boolean): string {
        const date = new Date(iso);
        if (isNaN(date.getTime())) return "";
        const isoStr = date.toISOString();
        if (allDay) {
            return isoStr.split("T")[0].replace(/-/g, ""); // yyyyMMdd
        }
        return isoStr.replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // yyyyMMddTHHmmssZ
    }
}
