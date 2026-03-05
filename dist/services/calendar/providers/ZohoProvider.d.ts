import { ICalendarProvider, CalendarEventData, ProviderAuthResult, ProviderTokenResult, IncrementalSyncResult } from "../ICalendarProvider";
export declare class ZohoProvider implements ICalendarProvider {
    getAuthUrl(userId: string): string;
    handleCallback(code: string, state: string): Promise<ProviderAuthResult>;
    getEvents(accessToken: string, calendarId: string, startDate?: Date, endDate?: Date): Promise<any[]>;
    getIncrementalChanges(accessToken: string, calendarId: string, token?: string): Promise<IncrementalSyncResult>;
    private formatMeetingUpdateTime;
    createEvent(accessToken: string, calendarId: string, eventData: CalendarEventData): Promise<any>;
    private getEvent;
    private getEventETag;
    updateEvent(accessToken: string, calendarId: string, externalId: string, eventData: CalendarEventData, action?: number, occurrenceDate?: string): Promise<any>;
    deleteEvent(accessToken: string, calendarId: string, externalId: string, action?: number, occurrenceDate?: string): Promise<void>;
    refreshToken(refreshToken: string): Promise<ProviderTokenResult>;
    private mapToZohoPayload;
    private toZohoDate;
    private resolveEventUrl;
    mapToInternalEvent(rawEvent: any): any;
}
