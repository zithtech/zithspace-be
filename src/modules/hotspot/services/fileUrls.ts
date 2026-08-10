// src/modules/hotspot/services/fileUrls.ts
//
// Turning a stored R2 URL into one a browser can actually load.
//
// THE PROBLEM THIS SOLVES:
//   Uploads are written with `CF_R2_PUBLIC_URL` as their prefix. On this
//   deployment that variable points at the R2 **S3 API endpoint**
//   (`https://<account>.r2.cloudflarestorage.com/<bucket>`), which serves
//   nothing without a SigV4 signature. Put that straight into an <img src> and
//   the browser gets a 403 and paints a broken-image icon — which is exactly
//   what a blog post's photo did.
//
//   Rather than depend on the bucket being made world-readable, we sign the URL
//   when serving it, the same way employee documents already do
//   (see employeeDocumentController). That works whether or not the bucket has
//   public access, and it keeps company photos off a public URL by default.
//
// Signing is a local HMAC — no network call — so doing it per image on a feed
// page is cheap. A failure is never fatal: the raw URL is returned, and a
// broken image is still better than a broken feed.

import { generatePresignedUrl } from '@/utils/r2Client';

/** How long a served image/file URL stays valid. Matches employee documents. */
const EXPIRES_IN_SECONDS = 86_400; // 24h

/**
 * True when the URL already points somewhere a browser can fetch unauthenticated
 * — an r2.dev public bucket or a custom domain. Those are left alone.
 */
function isPubliclyReadable(url: string): boolean {
  return /\.r2\.dev\//i.test(url) && !/\.r2\.cloudflarestorage\.com\//i.test(url);
}

/** Sign one URL for viewing. Returns the input unchanged if it cannot be signed. */
export async function signForViewing(url: string): Promise<string> {
  if (!url || isPubliclyReadable(url)) return url;
  try {
    return await generatePresignedUrl(url, EXPIRES_IN_SECONDS);
  } catch (err) {
    console.error('[hotspot] could not sign file url, serving raw:', err);
    return url;
  }
}

/**
 * Sign every URL in a list, in parallel.
 *
 * De-duplicates first: a feed page often repeats the same avatar or image, and
 * signing one URL twice produces two different signatures for no benefit.
 */
export async function signManyForViewing(urls: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(urls.filter(Boolean))];
  const signed = await Promise.all(unique.map((u) => signForViewing(u)));

  const map = new Map<string, string>();
  unique.forEach((url, i) => map.set(url, signed[i]));
  return map;
}
