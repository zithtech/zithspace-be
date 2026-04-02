"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAndUploadInvoicePDF = generateAndUploadInvoicePDF;
exports.generateAndUploadPayslipPDF = generateAndUploadPayslipPDF;
const puppeteer_1 = __importDefault(require("puppeteer"));
const client_s3_1 = require("@aws-sdk/client-s3");
const r2Client_1 = require("../utils/r2Client");
const invoiceTemplate_1 = require("../templates/invoiceTemplate");
const payslipTemplate_1 = require("../templates/payslipTemplate");
/**
 * Generates a PDF and uploads it to Cloudflare R2
 * @param invoice - The Prisma Invoice object
 * @param profile - The SettingsProfile (with general and payment relations)
 */
async function generateAndUploadInvoicePDF(invoice, profile) {
    // 1. Launch Puppeteer
    const browser = await puppeteer_1.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    try {
        const page = await browser.newPage();
        // 2. Generate HTML using both Invoice and Profile data
        const html = (0, invoiceTemplate_1.generateInvoiceHtml)(invoice, profile);
        // 3. Set content and wait for Tailwind/Google Fonts to load
        await page.setContent(html, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        // 4. Generate the PDF buffer
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true, // Required for Tailwind colors/backgrounds
            margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }, // Template has internal padding
            preferCSSPageSize: true
        });
        // 5. Define File Path with timestamp to break cache
        const timestamp = Date.now();
        const fileName = `${invoice.tenantId}/invoices/Invoice-${invoice.invoiceNumber}-${timestamp}.pdf`;
        // 6. Upload to R2
        await r2Client_1.s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: 'zithspace',
            Key: fileName,
            Body: pdfBuffer,
            ContentType: "application/pdf",
            // ContentDisposition 'inline' allows viewing in browser instead of auto-download
            ContentDisposition: `inline; filename="Invoice-${invoice.invoiceNumber}.pdf"`
        }));
        // 7. Return the public URL
        return `https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev/${fileName}`;
    }
    catch (error) {
        console.error("PDF Generation/Upload Error:", error);
        throw error;
    }
    finally {
        // 8. Always close the browser to prevent memory leaks
        await browser.close();
    }
}
/**
 * Generates a Payslip PDF and uploads it to Cloudflare R2
 */
async function generateAndUploadPayslipPDF(payout, company, configs = [], leaveSummary = {}) {
    const browser = await puppeteer_1.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    try {
        const page = await browser.newPage();
        const html = (0, payslipTemplate_1.generatePayslipHtml)(payout, company, configs, leaveSummary);
        await page.setContent(html, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
            preferCSSPageSize: true
        });
        const timestamp = Date.now();
        const fileName = `${payout.tenantId}/payroll/payslips/${payout.year}-${payout.month}/Payslip-${payout.employee.employee_code}-${timestamp}.pdf`;
        await r2Client_1.s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: 'zithspace',
            Key: fileName,
            Body: pdfBuffer,
            ContentType: "application/pdf",
            ContentDisposition: `inline; filename="Payslip-${payout.employee.employee_code}.pdf"`
        }));
        return `https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev/${fileName}`;
    }
    catch (error) {
        console.error("Payslip Generation Error:", error);
        throw error;
    }
    finally {
        await browser.close();
    }
}
//# sourceMappingURL=pdfService.js.map