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
        isSyncing: boolean;
        lastSyncStatus: string | null;
        lastSyncAt: Date | null;
        nextSyncDueAt: Date | null;
        syncErrorCount: number;
    }>;
    /**
     * Fetch events for a user/tenant, expanding recurring ones at runtime.
     */
    static getEvents(userId: string, tenantId: string, startDate?: Date, endDate?: Date): Promise<any[]>;
    /**
     * Get a valid access token for a user and provider, refreshing if necessary.
     */
    static getValidAccessToken(userId: string, provider: CalendarProvider): Promise<{
        accessToken: string;
        calendarId?: string;
    }>;
    /**
     * Sync events from the provider to the local database.
     * Always uses a date-range window to ensure cancelled/deleted occurrences are omitted.
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
        isDeleted: boolean;
        startTime: Date;
        endTime: Date;
        location: string | null;
        calendarId: string | null;
        provider: import(".prisma/client").$Enums.CalendarProvider;
        isRecurring: boolean;
        externalId: string;
        isAllDay: boolean;
        rrule: string | null;
        exdate: import("@prisma/client/runtime/library").JsonValue | null;
        calendar: string | null;
        sourceType: string | null;
        attendees: import("@prisma/client/runtime/library").JsonValue | null;
        meetingLink: string | null;
        organizerEmail: string | null;
    }>;
    private static expandRecurringEvent;
    /**
     * Update an event on the external provider and save locally.
     */
    static updateEvent(userId: string, tenantId: string, provider: CalendarProvider, externalId: string, eventData: CalendarEventData, action?: number, occurrenceDate?: string, userEmail?: string): Promise<any>;
    /**
     * Delete an event from the external provider and local database.
     */
    static deleteEvent(userId: string, tenantId: string, provider: CalendarProvider, externalId: string, action?: number, occurrenceDate?: string, userEmail?: string): Promise<void>;
    private static resolveMasterExternalId;
    private static extractTrueRrule;
    /**
     * Map provider-specific event data to the common CalendarEvent model.
     */
    private static mapToCalendarEvent;
    private static parseMicrosoftDate;
    private static microsoftRecurrenceToRRule;
    private static cleanMicrosoftBody;
    /**
     * Process an incremental sync for a specific integration.
     * Uses a Redis distributed lock to prevent concurrent syncs.
     */
    static processIncrementalSync(integrationId: string): Promise<{
        events: any[];
        nextToken: string;
        hasMore: boolean;
    }>;
    private static handleSyncResult;
    private static handleInstanceCancellation;
    private static handleInstanceUpsert;
    private static findMaster;
    private static parseZohoDate;
}
