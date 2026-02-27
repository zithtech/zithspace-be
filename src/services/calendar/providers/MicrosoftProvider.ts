import { ICalendarProvider, CalendarEventData, ProviderAuthResult, ProviderTokenResult } from "../ICalendarProvider";

export class MicrosoftProvider implements ICalendarProvider {
    getAuthUrl(userId: string): string {
        throw new Error("Microsoft integration coming soon. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in .env");
    }

    async handleCallback(code: string, state: string): Promise<ProviderAuthResult> {
        throw new Error("Microsoft integration coming soon");
    }

    async getEvents(accessToken: string, calendarId?: string, startDate?: Date, endDate?: Date): Promise<any[]> {
        return [];
    }

    async createEvent(accessToken: string, calendarId: string, eventData: CalendarEventData): Promise<any> {
        throw new Error("Microsoft integration coming soon");
    }

    async updateEvent(accessToken: string, calendarId: string, externalId: string, eventData: CalendarEventData): Promise<any> {
        throw new Error("Microsoft integration coming soon");
    }

    async deleteEvent(accessToken: string, calendarId: string, externalId: string, action?: number, occurrenceDate?: string): Promise<void> {
        throw new Error("Microsoft integration coming soon");
    }

    async refreshToken(refreshToken: string): Promise<ProviderTokenResult> {
        throw new Error("Microsoft integration coming soon");
    }
}
