"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarProviderFactory = void 0;
const client_1 = require("@prisma/client");
const ZohoProvider_1 = require("./providers/ZohoProvider");
const GoogleProvider_1 = require("./providers/GoogleProvider");
const MicrosoftProvider_1 = require("./providers/MicrosoftProvider");
class CalendarProviderFactory {
    static getProvider(provider) {
        if (!this.providers.has(provider)) {
            switch (provider) {
                case client_1.CalendarProvider.ZOHO:
                    this.providers.set(provider, new ZohoProvider_1.ZohoProvider());
                    break;
                case client_1.CalendarProvider.GOOGLE:
                    this.providers.set(provider, new GoogleProvider_1.GoogleProvider());
                    break;
                case client_1.CalendarProvider.MICROSOFT:
                    this.providers.set(provider, new MicrosoftProvider_1.MicrosoftProvider());
                    break;
                default:
                    throw new Error(`Provider ${provider} not supported`);
            }
        }
        return this.providers.get(provider);
    }
}
exports.CalendarProviderFactory = CalendarProviderFactory;
CalendarProviderFactory.providers = new Map();
//# sourceMappingURL=CalendarProviderFactory.js.map