/**
 * Generates a PDF and uploads it to Cloudflare R2
 * @param invoice - The Prisma Invoice object
 * @param profile - The SettingsProfile (with general and payment relations)
 */
export declare function generateAndUploadInvoicePDF(invoice: any, profile: any): Promise<string>;
/**
 * Generates a Payslip PDF and uploads it to Cloudflare R2
 */
export declare function generateAndUploadPayslipPDF(payout: any, company: any, configs?: any[], leaveSummary?: any): Promise<string>;
