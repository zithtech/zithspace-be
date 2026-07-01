// src/modules/payroll/services/payslipLogo.ts
//
// Uploads a company logo (base64 data URI) to Cloudflare R2 under a payslip-
// specific branding folder and returns its public URL. Kept separate from the
// payslip PDF upload so logo handling stays self-contained.

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';
import { s3Client, BUCKET_NAME } from '@/utils/r2Client';
import { PayrollError } from '../types';

const PUBLIC_URL = process.env.CF_R2_PUBLIC_URL;

function publicBase(): string {
  return (PUBLIC_URL && !PUBLIC_URL.includes('r2.cloudflarestorage.com')
    ? PUBLIC_URL
    : 'https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev'
  ).replace(/\/$/, '');
}

const ALLOWED: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
};
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/** Upload a base64 data-URI logo to R2; returns its public URL + storage key. */
export async function uploadPayslipLogo(tenantId: string, dataUri: string): Promise<{ url: string; key: string }> {
  const m = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(dataUri.trim());
  if (!m) throw PayrollError.badRequest('Invalid image — expected a base64 data URI');
  const contentType = m[1].toLowerCase();
  const ext = ALLOWED[contentType];
  if (!ext) throw PayrollError.badRequest('Unsupported image type. Use PNG, JPG, WEBP or GIF');

  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length === 0) throw PayrollError.badRequest('Image is empty');
  if (buffer.length > MAX_BYTES) throw PayrollError.badRequest('Logo exceeds the 2 MB limit');

  const key = `${tenantId}/payroll/branding/logo_${nanoid(10)}.${ext}`;
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000',
  }));

  return { url: `${publicBase()}/${key}`, key };
}
