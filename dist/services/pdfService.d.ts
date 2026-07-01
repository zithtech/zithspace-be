/**
 * Generates a PDF and uploads it to Cloudflare R2
 * @param invoice - The Prisma Invoice object
 * @param profile - The SettingsProfile (with general and payment relations)
 */
export declare function generateAndUploadInvoicePDF(invoice: any, profile: any): Promise<string>;
