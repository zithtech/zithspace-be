import { CalendarProvider } from "@prisma/client";
import { ICalendarProvider } from "./ICalendarProvider";
export declare class CalendarProviderFactory {
    private static providers;
    static getProvider(provider: CalendarProvider): ICalendarProvider;
}
