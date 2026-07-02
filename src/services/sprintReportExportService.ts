import puppeteer from 'puppeteer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../utils/r2Client';

export class SprintReportExportService {
  private static BUCKET_NAME = 'zithspace';
  private static R2_PUBLIC_URL = 'https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev';

  /**
   * Wraps the raw frontend HTML in a basic document with Tailwind CSS
   */
  private static wrapHtml(innerHtml: string): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Sprint Report Export</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
          body {
            font-family: 'Inter', sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          /* Custom overrides for print mode */
          .break-inside-avoid {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        </style>
      </head>
      <body>
        ${innerHtml}
      </body>
      </html>
    `;
  }

  /**
   * Generates PDF using Puppeteer from raw HTML payload and streams it directly to response
   */
  static async generatePDFBuffer(htmlPayload: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    try {
      const page = await browser.newPage();

      const fullHtml = this.wrapHtml(htmlPayload);

      // Wait for Tailwind to process and fonts to load
      await page.setContent(fullHtml, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // Additional small delay to ensure rendering is complete (Tailwind CDN async rendering)
      await new Promise(r => setTimeout(r, 2000));

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        scale: 0.7, // Scale down by 30% to fit wide tables horizontally
        margin: { top: '15mm', right: '5mm', bottom: '15mm', left: '5mm' }
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }
}
