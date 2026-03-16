import { CalendarProvider } from "@prisma/client";
import { ICalendarProvider } from "./ICalendarProvider";
import { ZohoProvider } from "./providers/ZohoProvider";
import { GoogleProvider } from "./providers/GoogleProvider";
import { MicrosoftProvider } from "./providers/MicrosoftProvider";

export class CalendarProviderFactory {
    private static providers: Map<CalendarProvider, ICalendarProvider> = new Map();

    static getProvider(provider: CalendarProvider): ICalendarProvider {
        if (!this.providers.has(provider)) {
            switch (provider) {
                case CalendarProvider.ZOHO:
                    this.providers.set(provider, new ZohoProvider());
                    break;
                case CalendarProvider.GOOGLE:
                    this.providers.set(provider, new GoogleProvider());
                    break;
                case CalendarProvider.MICROSOFT:
                    this.providers.set(provider, new MicrosoftProvider());
                    break;
                default:
                    throw new Error(`Provider ${provider} not supported`);
            }
        }
        return this.providers.get(provider)!;
    }
}
