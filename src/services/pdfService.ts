


import puppeteer from 'puppeteer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../utils/r2Client'; 
import { generateInvoiceHtml } from '../templates/invoiceTemplate';

/**
 * Generates a PDF and uploads it to Cloudflare R2
 * @param invoice - The Prisma Invoice object
 * @param profile - The SettingsProfile (with general and payment relations)
 */
export async function generateAndUploadInvoicePDF(invoice: any, profile: any): Promise<string> {
  // 1. Launch Puppeteer
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    
    // 2. Generate HTML using both Invoice and Profile data
    const html = generateInvoiceHtml(invoice, profile);
    
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

    // 5. Define File Path
    const fileName = `${invoice.tenantId}/invoices/Invoice-${invoice.invoiceNumber}.pdf`;
    
    // 6. Upload to R2
    await s3Client.send(new PutObjectCommand({
      Bucket: 'zithspace',
      Key: fileName,
      Body: pdfBuffer,
      ContentType: "application/pdf",
      // ContentDisposition 'inline' allows viewing in browser instead of auto-download
      ContentDisposition: `inline; filename="Invoice-${invoice.invoiceNumber}.pdf"`
    }));

    // 7. Return the public URL
    return `https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev/${fileName}`;

  } catch (error) {
    console.error("PDF Generation/Upload Error:", error);
    throw error;
  } finally {
    // 8. Always close the browser to prevent memory leaks
    await browser.close();
  }
}