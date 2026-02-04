/**
 * --- ENUMS ---
 */
export declare enum Currency {
    USD = "USD",
    INR = "INR",
    EUR = "EUR",
    GBP = "GBP",
    AUD = "AUD",
    CAD = "CAD",
    SGD = "SGD"
}
export declare enum DateFormat {
    DD_MM_YYYY = "DD_MM_YYYY",
    MM_DD_YYYY = "MM_DD_YYYY",
    YYYY_MM_DD = "YYYY_MM_DD"
}
/**
 * --- UTILITIES ---
 */
export declare const convertNumberToWords: (num: number, currency?: string) => string;
export declare const generateInvoiceHtml: (invoice: any, profile: any) => string;
