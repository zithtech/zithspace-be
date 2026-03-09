import { ICalendarProvider, CalendarEventData, ProviderAuthResult, ProviderTokenResult, IncrementalSyncResult } from "../ICalendarProvider";
export declare class GoogleProvider implements ICalendarProvider {
    getAuthUrl(userId: string): string;
    handleCallback(code: string, state: string): Promise<ProviderAuthResult>;
    getEvents(accessToken: string, calendarId?: string, startDate?: Date, endDate?: Date): Promise<any[]>;
    getIncrementalChanges(accessToken: string, calendarId: string, token?: string): Promise<IncrementalSyncResult>;
    createEvent(accessToken: string, calendarId: string, eventData: CalendarEventData): Promise<any>;
    updateEvent(accessToken: string, calendarId: string, externalId: string, eventData: CalendarEventData, action?: number, occurrenceDate?: string): Promise<any>;
    deleteEvent(accessToken: string, calendarId: string, externalId: string, action?: number, occurrenceDate?: string): Promise<void>;
    refreshToken(refreshToken: string): Promise<ProviderTokenResult>;
    private mapToGooglePayload;
    mapToInternalEvent(rawEvent: any): any;
}
