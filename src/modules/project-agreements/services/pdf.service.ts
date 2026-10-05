// src/modules/project-agreements/services/pdf.service.ts
//
// Rendered document → A4 PDF → R2, returning the public URL.
//
// TWO THINGS THIS FILE EXISTS TO GET RIGHT:
//
// 1. `preferCSSPageSize: true` and NO puppeteer margin option. The margins are
//    declared in the document's own @page rule, because they double as the
//    letterhead bands (see render.service.ts). Passing margins here as well
//    would silently win and crush the header and footer off the page.
//
// 2. The logo is inlined as a data: URI before the page loads. A remote image
//    that is still in flight when Chrome prints simply does not appear, and a
//    private R2 object never loads at all — so a contract would go out with a
//    blank letterhead and nothing to show for it in the logs.

import puppeteer from 'puppeteer';
import { uploadBufferToR2 } from '@/utils/r2Client';

export interface PdfResult {
  url: string;
  bytes: number;
}

/* ── One warm browser ──────────────────────────────────────────────────────
 * Launching Chrome costs about a second. That is tolerable once, when someone
 * downloads a contract; it is not tolerable on a live preview that re-renders
 * as they type. So the browser is launched on first use and kept, and only the
 * PAGE is created and closed per render.
 *
 * It does not stay forever: an idle timer closes it, so a quiet API process
 * does not hold ~100MB of Chrome indefinitely. The next render pays the launch
 * again, which is the right trade — the cost lands on someone who has waited a
 * while anyway, never mid-typing.
 */
const IDLE_SHUTDOWN_MS = 5 * 60_000;

let browserPromise: Promise<import('puppeteer').Browser> | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let inFlight = 0;

async function getBrowser(): Promise<import('puppeteer').Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      })
      .then((b) => {
        // A crashed or externally killed Chrome must not leave a poisoned
        // promise behind that every later render then awaits forever.
        b.on('disconnected', () => {
          if (browserPromise) browserPromise = null;
        });
        return b;
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

function scheduleIdleShutdown(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (inFlight > 0) return; // a render started while the timer was pending
    const pending = browserPromise;
    browserPromise = null;
    pending?.then((b) => b.close()).catch(() => {
      // Already gone. Nothing to clean up.
    });
  }, IDLE_SHUTDOWN_MS);
  // Do not keep the process alive just to close a browser later.
  idleTimer.unref?.();
}

export async function renderPdfBuffer(html: string): Promise<Buffer> {
  const prepared = await inlineImages(html);

  const browser = await getBrowser();
  inFlight += 1;
  const page = await browser.newPage();
  try {
    // 'load', not 'networkidle0'. Every image is already a data: URI by the
    // time we get here, so there is no network to go idle — networkidle0 just
    // sat out its own 500ms quiet window on every single render. 'load' still
    // waits for images to decode, which is the part that actually matters, and
    // covers the case where inlining failed and one is still remote.
    await page.setContent(prepared, { waitUntil: 'load', timeout: 30_000 });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });

    return Buffer.from(pdf);
  } finally {
    // The PAGE always closes; the browser is reused.
    await page.close().catch(() => {});
    inFlight -= 1;
    scheduleIdleShutdown();
  }
}

/** How many pages a rendered PDF came out as, without re-parsing it properly. */
export function pageCountOf(pdf: Buffer): number {
  const matches = pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 1;
}

/** Close the shared browser (call from graceful shutdown). */
export async function closePdfBrowser(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer);
  const pending = browserPromise;
  browserPromise = null;
  if (pending) await pending.then((b) => b.close()).catch(() => {});
}

/** Render, store, and hand back the public URL. */
export async function generateAndStorePdf(
  html: string,
  tenantId: string,
  agreementId: string,
  fileLabel: string
): Promise<PdfResult> {
  const buffer = await renderPdfBuffer(html);
  const safeLabel = (fileLabel || 'agreement').replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 80);

  // uploadBufferToR2 adds its own nanoid to the filename, so re-generating the
  // same agreement lands on a fresh object rather than a cached old one.
  const { fileUrl, fileSize } = await uploadBufferToR2(
    buffer,
    'application/pdf',
    `${safeLabel}.pdf`,
    tenantId,
    `project-agreements/${agreementId}`
  );
  return { url: fileUrl, bytes: fileSize };
}

/**
 * Swap every remote <img src> for a data: URI so Chrome has the bytes in hand
 * when it prints. A fetch that fails leaves the tag untouched: a missing logo
 * is a cosmetic problem, a thrown exception loses the whole document.
 */
async function inlineImages(html: string): Promise<string> {
  const srcs = new Set<string>();
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (!m[1].startsWith('data:')) srcs.add(m[1]);
  }
  if (srcs.size === 0) return html;

  let out = html;
  await Promise.all(
    [...srcs].map(async (src) => {
      try {
        const res = await fetch(src);
        if (!res.ok) return;
        const type = res.headers.get('content-type') || guessType(src);
        const buf = Buffer.from(await res.arrayBuffer());
        // 8MB of base64 in a header image is a mistake, not a design; leave it
        // remote rather than bloating every page of the PDF with it.
        if (buf.length > 8 * 1024 * 1024) return;
        const uri = `data:${type};base64,${buf.toString('base64')}`;
        out = out.split(src).join(uri);
      } catch (err) {
        console.warn('[project-agreements] could not inline image for PDF:', src);
      }
    })
  );
  return out;
}

function guessType(src: string): string {
  const ext = src.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}
