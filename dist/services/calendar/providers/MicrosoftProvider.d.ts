import { ICalendarProvider, CalendarEventData, ProviderAuthResult, ProviderTokenResult } from "../ICalendarProvider";
export declare class MicrosoftProvider implements ICalendarProvider {
    getAuthUrl(userId: string): string;
    handleCallback(code: string, state: string): Promise<ProviderAuthResult>;
    getEvents(accessToken: string, calendarId?: string, startDate?: Date, endDate?: Date): Promise<any[]>;
    createEvent(accessToken: string, calendarId: string, eventData: CalendarEventData): Promise<any>;
    updateEvent(accessToken: string, calendarId: string, externalId: string, eventData: CalendarEventData): Promise<any>;
    deleteEvent(accessToken: string, calendarId: string, externalId: string, action?: number, occurrenceDate?: string): Promise<void>;
    refreshToken(refreshToken: string): Promise<ProviderTokenResult>;
}
