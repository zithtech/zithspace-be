"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MicrosoftProvider = void 0;
class MicrosoftProvider {
    getAuthUrl(userId) {
        throw new Error("Microsoft integration coming soon. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in .env");
    }
    async handleCallback(code, state) {
        throw new Error("Microsoft integration coming soon");
    }
    async getEvents(accessToken, calendarId, startDate, endDate) {
        return [];
    }
    async createEvent(accessToken, calendarId, eventData) {
        throw new Error("Microsoft integration coming soon");
    }
    async updateEvent(accessToken, calendarId, externalId, eventData) {
        throw new Error("Microsoft integration coming soon");
    }
    async deleteEvent(accessToken, calendarId, externalId, action, occurrenceDate) {
        throw new Error("Microsoft integration coming soon");
    }
    async refreshToken(refreshToken) {
        throw new Error("Microsoft integration coming soon");
    }
}
exports.MicrosoftProvider = MicrosoftProvider;
//# sourceMappingURL=MicrosoftProvider.js.map