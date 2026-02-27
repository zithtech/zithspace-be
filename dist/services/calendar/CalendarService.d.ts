import { CalendarProvider } from "@prisma/client";
import { CalendarEventData } from "./ICalendarProvider";
export declare class CalendarService {
    /**
     * Get the authorization URL for a specific provider.
     */
    static getAuthUrl(provider: CalendarProvider, userId: string): Promise<string>;
    /**
     * Handle the OAuth callback and save integration details.
     */
    static handleCallback(provider: CalendarProvider, userId: string, tenantId: string, code: string, state: string): Promise<{
        tenantId: string;
        refreshToken: string | null;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        updatedById: string | null;
        id: string;
        userId: string;
        accessToken: string | null;
        calendarId: string | null;
        provider: import(".prisma/client").$Enums.CalendarProvider;
        tokenExpiry: Date | null;
        googleSyncToken: string | null;
        googleChannelId: string | null;
        googleResourceId: string | null;
        googleChannelExpiry: Date | null;
        microsoftDeltaLink: string | null;
        microsoftSubscriptionId: string | null;
        microsoftSubscriptionExpiry: Date | null;
        microsoftClientState: string | null;
        zohoLastSync: Date | null;
    }>;
    /**
     * Get a valid access token for a user and provider, refreshing if necessary.
     */
    static getValidAccessToken(userId: string, provider: CalendarProvider): Promise<{
        accessToken: string;
        calendarId?: string;
    }>;
    /**
     * Sync events from the provider to the local database.
     */
    static syncEvents(userId: string, tenantId: string, provider: CalendarProvider, startDate?: Date, endDate?: Date): Promise<number>;
    /**
     * Create an event on the external provider and save locally.
     */
    static createEvent(userId: string, tenantId: string, provider: CalendarProvider, eventData: CalendarEventData): Promise<{
        tenantId: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        updatedById: string | null;
        id: string;
        userId: string;
        title: string;
        description: string | null;
        startTime: Date;
        endTime: Date;
        location: string | null;
        calendarId: string | null;
        provider: import(".prisma/client").$Enums.CalendarProvider;
        externalId: string;
        isAllDay: boolean;
        isRecurring: boolean;
        rrule: string | null;
        exdate: import("@prisma/client/runtime/library").JsonValue | null;
        calendar: string | null;
        sourceType: string | null;
        attendees: import("@prisma/client/runtime/library").JsonValue | null;
        meetingLink: string | null;
    }>;
    /**
     * Update an event on the external provider and save locally.
     */
    static updateEvent(userId: string, tenantId: string, provider: CalendarProvider, externalId: string, eventData: CalendarEventData): Promise<{
        tenantId: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        updatedById: string | null;
        id: string;
        userId: string;
        title: string;
        description: string | null;
        startTime: Date;
        endTime: Date;
        location: string | null;
        calendarId: string | null;
        provider: import(".prisma/client").$Enums.CalendarProvider;
        externalId: string;
        isAllDay: boolean;
        isRecurring: boolean;
        rrule: string | null;
        exdate: import("@prisma/client/runtime/library").JsonValue | null;
        calendar: string | null;
        sourceType: string | null;
        attendees: import("@prisma/client/runtime/library").JsonValue | null;
        meetingLink: string | null;
    }>;
    /**
     * Delete an event from the external provider and local database.
     */
    static deleteEvent(userId: string, tenantId: string, provider: CalendarProvider, externalId: string, action?: number, occurrenceDate?: string): Promise<number | {
        tenantId: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        updatedById: string | null;
        id: string;
        userId: string;
        title: string;
        description: string | null;
        startTime: Date;
        endTime: Date;
        location: string | null;
        calendarId: string | null;
        provider: import(".prisma/client").$Enums.CalendarProvider;
        externalId: string;
        isAllDay: boolean;
        isRecurring: boolean;
        rrule: string | null;
        exdate: import("@prisma/client/runtime/library").JsonValue | null;
        calendar: string | null;
        sourceType: string | null;
        attendees: import("@prisma/client/runtime/library").JsonValue | null;
        meetingLink: string | null;
    }>;
    /**
     * Map provider-specific event data to the common CalendarEvent model.
     */
    private static mapToCalendarEvent;
    private static parseZohoDate;
}
