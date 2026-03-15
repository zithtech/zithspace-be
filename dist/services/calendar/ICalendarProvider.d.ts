export interface CalendarEventData {
    title: string;
    description?: string;
    location?: string;
    startTime: Date;
    endTime: Date;
    isAllDay?: boolean;
    isRecurring?: boolean;
    rrule?: string;
    attendees?: string[];
    generateMeeting?: boolean;
    recurringDays?: string[];
    existingMeetingLink?: string;
}
export interface ProviderAuthResult {
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    calendarId?: string;
}
export interface ProviderTokenResult {
    accessToken: string;
    expiresIn: number;
}
export interface IncrementalSyncResult {
    events: any[];
    nextToken: string;
    hasMore: boolean;
}
export interface ICalendarProvider {
    getAuthUrl(userId: string): string;
    handleCallback(code: string, state: string): Promise<ProviderAuthResult>;
    getEvents(accessToken: string, calendarId?: string, startDate?: Date, endDate?: Date): Promise<any[]>;
    getIncrementalChanges(accessToken: string, calendarId: string, token?: string): Promise<IncrementalSyncResult>;
    createEvent(accessToken: string, calendarId: string, eventData: CalendarEventData): Promise<any>;
    updateEvent(accessToken: string, calendarId: string, externalId: string, eventData: CalendarEventData, action?: number, occurrenceDate?: string): Promise<any>;
    deleteEvent(accessToken: string, calendarId: string, externalId: string, action?: number, occurrenceDate?: string): Promise<void>;
    refreshToken(refreshToken: string): Promise<ProviderTokenResult>;
    mapToInternalEvent?(rawEvent: any): any;
}
