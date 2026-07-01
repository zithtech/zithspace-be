// src/modules/payroll/services/payslipPdf.ts
//
// Renders payslip HTML → A4 PDF (Puppeteer) and uploads to Cloudflare R2,
// reusing the platform's shared s3Client / bucket. One browser is launched for
// the whole batch and reused per page (cheaper than per-employee launches).

import puppeteer, { Browser } from 'puppeteer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';
import { s3Client, BUCKET_NAME } from '@/utils/r2Client';

const PUBLIC_URL = process.env.CF_R2_PUBLIC_URL;

function publicBase(): string {
  return (PUBLIC_URL && !PUBLIC_URL.includes('r2.cloudflarestorage.com')
    ? PUBLIC_URL
    : 'https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev'
  ).replace(/\/$/, '');
}

export interface PayslipRenderInput {
  employeeId: string;
  html: string;
}

export interface PayslipRenderResult {
  employeeId: string;
  fileUrl: string;
  fileKey: string;
}

/**
 * Render ONE payslip HTML → PDF on an already-running browser and upload to R2.
 * Used by the async worker (which owns a long-lived, reused browser). The page
 * is always closed; the browser is not.
 */
export async function renderAndUploadOne(
  browser: Browser,
  html: string,
  meta: { tenantId: string; year: number; month: number; employeeId: string }
): Promise<{ fileUrl: string; fileKey: string }> {
  const mm = String(meta.month).padStart(2, '0');
  const key = `${meta.tenantId}/payroll/payslips/${meta.year}-${mm}/${meta.employeeId}_${nanoid(8)}.pdf`;
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      preferCSSPageSize: true,
    });
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
        ContentDisposition: 'inline; filename="Payslip.pdf"',
      })
    );
    return { fileUrl: `${publicBase()}/${key}`, fileKey: key };
  } finally {
    await page.close();
  }
}

/**
 * Render + upload a batch of payslips. Returns one result per input. Runs the
 * pages sequentially through a single browser to avoid overloading Puppeteer.
 */
export async function renderAndUploadPayslips(
  inputs: PayslipRenderInput[],
  meta: { tenantId: string; year: number; month: number }
): Promise<PayslipRenderResult[]> {
  if (inputs.length === 0) return [];

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const results: PayslipRenderResult[] = [];
  const base = publicBase();
  const mm = String(meta.month).padStart(2, '0');

  try {
    for (const input of inputs) {
      const page = await browser.newPage();
      try {
        await page.setContent(input.html, { waitUntil: 'networkidle0', timeout: 30000 });
        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
          preferCSSPageSize: true,
        });

        const key = `${meta.tenantId}/payroll/payslips/${meta.year}-${mm}/${input.employeeId}_${nanoid(8)}.pdf`;
        await s3Client.send(
          new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: pdfBuffer,
            ContentType: 'application/pdf',
            ContentDisposition: 'inline; filename="Payslip.pdf"',
          })
        );
        results.push({ employeeId: input.employeeId, fileUrl: `${base}/${key}`, fileKey: key });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}
