"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarService = void 0;
const database_1 = require("@/config/database");
const client_1 = require("@prisma/client");
const CalendarProviderFactory_1 = require("./CalendarProviderFactory");
class CalendarService {
    /**
     * Get the authorization URL for a specific provider.
     */
    static async getAuthUrl(provider, userId) {
        return CalendarProviderFactory_1.CalendarProviderFactory.getProvider(provider).getAuthUrl(userId);
    }
    /**
     * Handle the OAuth callback and save integration details.
     */
    static async handleCallback(provider, userId, tenantId, code, state) {
        const providerImpl = CalendarProviderFactory_1.CalendarProviderFactory.getProvider(provider);
        const result = await providerImpl.handleCallback(code, state);
        const expiry = new Date(Date.now() + result.expiresIn * 1000);
        return await database_1.prisma.calendarIntegration.upsert({
            where: { userId_provider: { userId, provider } },
            create: {
                id: `${userId}_${provider}`,
                userId,
                tenantId,
                provider,
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                tokenExpiry: expiry,
                calendarId: result.calendarId,
            },
            update: {
                accessToken: result.accessToken,
                refreshToken: result.refreshToken || undefined,
                tokenExpiry: expiry,
                calendarId: result.calendarId || undefined,
            },
        });
    }
    /**
     * Get a valid access token for a user and provider, refreshing if necessary.
     */
    static async getValidAccessToken(userId, provider) {
        const integration = await database_1.prisma.calendarIntegration.findUnique({
            where: { userId_provider: { userId, provider } },
        });
        if (!integration || !integration.accessToken) {
            throw new Error(`${provider} integration not found`);
        }
        const fiveMinutes = 5 * 60 * 1000;
        if (integration.tokenExpiry && integration.tokenExpiry.getTime() - Date.now() > fiveMinutes) {
            return { accessToken: integration.accessToken, calendarId: integration.calendarId || undefined };
        }
        if (!integration.refreshToken) {
            throw new Error(`${provider} refresh token not found`);
        }
        const providerImpl = CalendarProviderFactory_1.CalendarProviderFactory.getProvider(provider);
        const result = await providerImpl.refreshToken(integration.refreshToken);
        const expiry = new Date(Date.now() + result.expiresIn * 1000);
        await database_1.prisma.calendarIntegration.update({
            where: { id: integration.id },
            data: {
                accessToken: result.accessToken,
                tokenExpiry: expiry,
            },
        });
        return { accessToken: result.accessToken, calendarId: integration.calendarId || undefined };
    }
    /**
     * Sync events from the provider to the local database.
     */
    static async syncEvents(userId, tenantId, provider, startDate, endDate) {
        const { accessToken, calendarId } = await this.getValidAccessToken(userId, provider);
        const providerImpl = CalendarProviderFactory_1.CalendarProviderFactory.getProvider(provider);
        const externalEvents = await providerImpl.getEvents(accessToken, calendarId, startDate, endDate);
        const upsertOps = externalEvents.map((event) => {
            const mapped = this.mapToCalendarEvent(event, provider, userId, tenantId);
            return database_1.prisma.calendarEvent.upsert({
                where: { provider_externalId_tenantId: { provider, externalId: mapped.externalId, tenantId } },
                create: mapped,
                update: mapped,
            });
        });
        if (upsertOps.length > 0) {
            await database_1.prisma.$transaction(upsertOps);
        }
        return externalEvents.length;
    }
    /**
     * Create an event on the external provider and save locally.
     */
    static async createEvent(userId, tenantId, provider, eventData) {
        const { accessToken, calendarId } = await this.getValidAccessToken(userId, provider);
        if (!calendarId)
            throw new Error(`Primary calendar ID not found for ${provider}`);
        const providerImpl = CalendarProviderFactory_1.CalendarProviderFactory.getProvider(provider);
        const externalEvent = await providerImpl.createEvent(accessToken, calendarId, eventData);
        const mapped = this.mapToCalendarEvent(externalEvent, provider, userId, tenantId);
        return await database_1.prisma.calendarEvent.upsert({
            where: { provider_externalId_tenantId: { provider, externalId: mapped.externalId, tenantId } },
            create: mapped,
            update: mapped,
        });
    }
    /**
     * Update an event on the external provider and save locally.
     */
    static async updateEvent(userId, tenantId, provider, externalId, eventData) {
        const { accessToken, calendarId } = await this.getValidAccessToken(userId, provider);
        if (!calendarId)
            throw new Error(`Primary calendar ID not found for ${provider}`);
        const providerImpl = CalendarProviderFactory_1.CalendarProviderFactory.getProvider(provider);
        const externalEvent = await providerImpl.updateEvent(accessToken, calendarId, externalId, eventData);
        const mapped = this.mapToCalendarEvent(externalEvent, provider, userId, tenantId);
        return await database_1.prisma.calendarEvent.update({
            where: { provider_externalId_tenantId: { provider, externalId, tenantId } },
            data: mapped,
        });
    }
    /**
     * Delete an event from the external provider and local database.
     */
    static async deleteEvent(userId, tenantId, provider, externalId, action, occurrenceDate) {
        const { accessToken, calendarId } = await this.getValidAccessToken(userId, provider);
        if (!calendarId)
            throw new Error(`Primary calendar ID not found for ${provider}`);
        const providerImpl = CalendarProviderFactory_1.CalendarProviderFactory.getProvider(provider);
        await providerImpl.deleteEvent(accessToken, calendarId, externalId, action, occurrenceDate);
        if (action === 0) {
            // Partial delete: we don't delete the whole series, just sync again to get updated exdate
            return await this.syncEvents(userId, tenantId, provider);
        }
        return await database_1.prisma.calendarEvent.delete({
            where: { provider_externalId_tenantId: { provider, externalId, tenantId } },
        });
    }
    /**
     * Map provider-specific event data to the common CalendarEvent model.
     */
    static mapToCalendarEvent(externalEvent, provider, userId, tenantId) {
        if (provider === client_1.CalendarProvider.ZOHO) {
            const uid = externalEvent.uid || externalEvent.event_id;
            return {
                id: `${provider}_${uid}_${tenantId}`,
                provider,
                externalId: uid,
                tenantId,
                userId,
                title: externalEvent.title || "Untitled",
                description: externalEvent.description || null,
                location: externalEvent.location || null,
                startTime: this.parseZohoDate(externalEvent.dateandtime?.start || externalEvent.startdatetime),
                endTime: this.parseZohoDate(externalEvent.dateandtime?.end || externalEvent.enddatetime),
                isAllDay: !!externalEvent.isallday,
                isRecurring: !!(externalEvent.rrule || externalEvent.isrep),
                rrule: externalEvent.rrule || null,
                exdate: externalEvent.exdate || null,
                calendar: externalEvent.calendar || null,
                sourceType: externalEvent.source_type || externalEvent.sourceType || null,
                meetingLink: externalEvent.conference_data?.meetingdata?.meeting_link ||
                    externalEvent.app_data?.meetingdata?.meetinglink || externalEvent.meetingLink || null,
                attendees: externalEvent.attendees || null,
            };
        }
        else if (provider === client_1.CalendarProvider.GOOGLE) {
            return {
                id: `${provider}_${externalEvent.id}_${tenantId}`,
                provider,
                externalId: externalEvent.id,
                tenantId,
                userId,
                title: externalEvent.summary || "Untitled",
                description: externalEvent.description || null,
                location: externalEvent.location || null,
                startTime: new Date(externalEvent.start.dateTime || externalEvent.start.date),
                endTime: new Date(externalEvent.end.dateTime || externalEvent.end.date),
                isAllDay: !!externalEvent.start.date,
                isRecurring: !!externalEvent.recurrence,
                rrule: (externalEvent.recurrence && externalEvent.recurrence[0]) || null,
                meetingLink: externalEvent.hangoutLink || null,
                attendees: externalEvent.attendees || null,
            };
        }
        throw new Error(`Mapper for ${provider} not implemented`);
    }
    static parseZohoDate(raw) {
        if (!raw)
            return new Date();
        if (raw.includes("-"))
            return new Date(raw);
        if (raw.length === 8 && !raw.includes("T")) {
            return new Date(raw.replace(/^(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"));
        }
        const iso = raw.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6");
        return new Date(iso);
    }
}
exports.CalendarService = CalendarService;
//# sourceMappingURL=CalendarService.js.map