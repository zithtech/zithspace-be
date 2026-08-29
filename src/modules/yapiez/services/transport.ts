// src/modules/yapiez/services/transport.ts
//
// The one place Yapiez actually talks to the network.
//
// SECURITY — this module makes the *server* fetch a URL that a tenant user
// typed, which is textbook SSRF surface: without a guard, "https://…" could be
// http://169.254.169.254/ (cloud metadata) or http://localhost:5432 and the
// response would be handed straight back to the caller. `assertUrlAllowed`
// resolves the host and refuses loopback, link-local, private and unique-local
// ranges. Self-hosted installs that legitimately test an internal API can set
// YAPIEZ_ALLOW_PRIVATE_HOSTS=true, and YAPIEZ_HOST_ALLOWLIST accepts a
// comma-separated list of specific internal hosts to permit without opening
// everything.

import axios, { AxiosRequestConfig, AxiosResponse, Method } from 'axios';
import { lookup } from 'dns/promises';
import net from 'net';
import { YapiezError } from '../types';
import { ExecutedResponse } from './assertions';

const DEFAULT_TIMEOUT_MS = Number(process.env.YAPIEZ_DEFAULT_TIMEOUT_MS ?? 30_000);
const MAX_TIMEOUT_MS = Number(process.env.YAPIEZ_MAX_TIMEOUT_MS ?? 120_000);
/** Responses larger than this are truncated before storage — runs are evidence, not a cache. */
const MAX_STORED_BODY = Number(process.env.YAPIEZ_MAX_BODY_BYTES ?? 256_000);

const allowPrivate = String(process.env.YAPIEZ_ALLOW_PRIVATE_HOSTS ?? '').toLowerCase() === 'true';
const hostAllowlist = new Set(
  String(process.env.YAPIEZ_HOST_ALLOWLIST ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
);

/** True for addresses that must never be reachable from a tenant-authored URL. */
function isBlockedAddress(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 127) return true;                       // loopback
    if (a === 10) return true;                        // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true;          // private
    if (a === 169 && b === 254) return true;          // link-local / cloud metadata
    if (a === 0) return true;                         // "this network"
    if (a >= 224) return true;                        // multicast + reserved
    return false;
  }
  if (version === 6) {
    const normalised = ip.toLowerCase();
    if (normalised === '::1' || normalised === '::') return true;
    if (normalised.startsWith('fe80')) return true;   // link-local
    if (/^f[cd]/.test(normalised)) return true;       // unique-local
    // IPv4-mapped (::ffff:127.0.0.1) — re-check the embedded address.
    const mapped = normalised.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    return false;
  }
  return true;
}

/**
 * Refuse a URL before any request is made.
 *
 * Note the residual TOCTOU: DNS is resolved here and again by the HTTP client,
 * so a hostile rebinding record could differ between the two. Closing that
 * fully means pinning the socket to the checked IP; the check below is the
 * proportionate guard for an authenticated, permissioned, single-tenant tool,
 * and the deployment knobs above exist so operators can tighten or relax it.
 */
export async function assertUrlAllowed(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw YapiezError.badRequest(
      `"${rawUrl}" is not a valid absolute URL. Set a Base URL on the environment, or give the API an absolute URL.`
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw YapiezError.badRequest(`Unsupported protocol "${parsed.protocol}" — only http and https can be executed.`);
  }

  const host = parsed.hostname.toLowerCase();
  if (hostAllowlist.has(host)) return parsed;
  if (allowPrivate) return parsed;

  // A literal IP needs no lookup; a hostname does, and every A/AAAA record it
  // resolves to must be acceptable.
  const addresses = net.isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => {
        throw YapiezError.badRequest(`Could not resolve host "${host}".`);
      });

  for (const { address } of addresses) {
    if (isBlockedAddress(address)) {
      throw YapiezError.badRequest(
        `Refusing to call "${host}" — it resolves to a private or loopback address (${address}). ` +
          `Set YAPIEZ_ALLOW_PRIVATE_HOSTS=true or add the host to YAPIEZ_HOST_ALLOWLIST to permit internal targets.`
      );
    }
  }

  return parsed;
}

export interface TransportRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body?: string;
  bodyType: string;
  timeoutMs?: number;
}

export interface TransportResult {
  response: ExecutedResponse;
  /** The absolute URL actually called, query string included. */
  finalUrl: string;
  /** Set when the call never produced an HTTP response (DNS, timeout, refused). */
  error?: string;
}

/**
 * Byte length of a decoded body.
 *
 * The decoded size rather than the `content-length` header: with compression
 * on the wire those disagree, and the honest number is the size of the payload
 * actually being shown, not how many bytes it arrived in.
 */
export function byteLengthOf(text: string): number {
  return Buffer.byteLength(text ?? '', 'utf8');
}

function truncate(value: string): string {
  if (value.length <= MAX_STORED_BODY) return value;
  return `${value.slice(0, MAX_STORED_BODY)}\n…[truncated ${value.length - MAX_STORED_BODY} bytes]`;
}

/** Normalise axios' header bag into a plain lowercase-keyed string map. */
function flattenHeaders(raw: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  const source = typeof raw.toJSON === 'function' ? raw.toJSON() : raw;
  for (const [key, value] of Object.entries(source)) {
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

/** Parse a JSON body when the response says it is JSON; otherwise keep the text. */
function parseBody(raw: string, contentType: string | undefined): unknown {
  if (!raw) return raw;
  if (contentType && !/json/i.test(contentType)) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Execute one request and always come back with something recordable.
 *
 * A 4xx/5xx is a normal outcome here, not an exception — the assertions decide
 * whether it means Fail. Only a transport-level failure sets `error`, and even
 * then a synthetic 0-status response is returned so the run step has a row.
 */
export async function execute(request: TransportRequest): Promise<TransportResult> {
  const url = await assertUrlAllowed(request.url);
  for (const [key, value] of Object.entries(request.query)) {
    if (key) url.searchParams.set(key, value);
  }

  const timeout = Math.min(MAX_TIMEOUT_MS, request.timeoutMs || DEFAULT_TIMEOUT_MS);
  const headers: Record<string, string> = { ...request.headers };

  let data: any;
  if (request.body && request.bodyType !== 'none') {
    if (request.bodyType === 'json') {
      // Send the author's exact bytes when they are valid JSON so a
      // deliberately malformed payload can still be tested.
      try {
        data = JSON.parse(request.body);
      } catch {
        data = request.body;
      }
      if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = 'application/json';
      }
    } else if (request.bodyType === 'form') {
      data = new URLSearchParams(
        request.body
          .split('\n')
          .map((line) => line.split('='))
          .filter(([k]) => k?.trim())
          .map(([k, ...rest]) => [k.trim(), rest.join('=').trim()] as [string, string])
      ).toString();
      if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    } else {
      data = request.body;
    }
  }

  const config: AxiosRequestConfig = {
    method: request.method as Method,
    url: url.toString(),
    headers,
    data,
    timeout,
    // Never follow a redirect into somewhere the guard above rejected.
    maxRedirects: 0,
    // Every status is a result to record, not a throw.
    validateStatus: () => true,
    // Read as text so the raw body is preserved exactly for the run record.
    transformResponse: [(body: any) => body],
    responseType: 'text',
    maxContentLength: MAX_STORED_BODY * 4,
    maxBodyLength: MAX_STORED_BODY * 4,
  };

  const startedAt = Date.now();
  try {
    const res: AxiosResponse = await axios.request(config);
    const durationMs = Date.now() - startedAt;
    const responseHeaders = flattenHeaders(res.headers);
    const rawBody = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '');

    return {
      finalUrl: url.toString(),
      response: {
        statusCode: res.status,
        headers: responseHeaders,
        body: parseBody(rawBody, responseHeaders['content-type']),
        rawBody: truncate(rawBody),
        // Measured before truncation, so a clipped body still reports its real size.
        byteSize: byteLengthOf(rawBody),
        durationMs,
      },
    };
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    const message =
      err?.code === 'ECONNABORTED'
        ? `Request timed out after ${timeout}ms`
        : err?.message || 'Request failed';

    return {
      finalUrl: url.toString(),
      error: message,
      response: {
        statusCode: 0,
        headers: {},
        body: undefined,
        rawBody: '',
        byteSize: 0,
        durationMs,
      },
    };
  }
}
