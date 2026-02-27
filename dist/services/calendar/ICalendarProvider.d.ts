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
export interface ICalendarProvider {
    getAuthUrl(userId: string): string;
    handleCallback(code: string, state: string): Promise<ProviderAuthResult>;
    getEvents(accessToken: string, calendarId?: string, startDate?: Date, endDate?: Date): Promise<any[]>;
    createEvent(accessToken: string, calendarId: string, eventData: CalendarEventData): Promise<any>;
    updateEvent(accessToken: string, calendarId: string, externalId: string, eventData: CalendarEventData): Promise<any>;
    deleteEvent(accessToken: string, calendarId: string, externalId: string, action?: number, occurrenceDate?: string): Promise<void>;
    refreshToken(refreshToken: string): Promise<ProviderTokenResult>;
}
