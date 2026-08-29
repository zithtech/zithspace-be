// src/config/brand.ts
//
// Which brand is this request, email or link for?
//
// The backend serves both surfaces from one deployment, so anything that leaves
// the system carrying a name or a URL has to be told which brand it belongs to.
// Getting this wrong is not cosmetic: a Testiez customer who receives a
// "zukvo.com" invite link learns about a product they were never sold, and the
// standalone story collapses in one email.
//
// This is the server-side twin of zukvo-fe/src/lib/product.ts. The host-matching
// rules must stay in step with it — if they drift, the app renders one brand and
// emails the other.
//
// RESOLUTION ORDER, most to least authoritative:
//
//   1. The request's Origin/Host. The user is literally looking at that brand
//      right now, so it beats anything inferred.
//   2. The tenant's entitlements, when there is no request (background jobs,
//      queue workers). A tenant holding ONLY 'testiez' gets Testiez branding.
//   3. Zukvo. Ambiguous cases — a tenant holding both products with no request
//      context — fall back to the parent brand rather than guessing.

import { Request } from 'express';
import { Product, getProducts } from '@/modules/entitlements/entitlements.service';

export interface Brand {
  product: Product;
  /** Display name in emails, page titles and the shell header. */
  name: string;
  /** Tenant subdomains hang off this: {slug}.{baseDomain}. */
  baseDomain: string;
  supportEmail: string;
  systemEmail: string;
  marketingUrl: string;
}

const ZUKVO: Brand = {
  product: 'zukvo',
  name: 'Zukvo',
  baseDomain: process.env.TENANT_BASE_DOMAIN || 'zukvo.com',
  supportEmail: process.env.SYSTEM_EMAIL || 'support@zukvo.com',
  systemEmail: process.env.SYSTEM_EMAIL || process.env.SMTP_USER || 'system@zukvo.com',
  marketingUrl: 'https://zukvo.com',
};

const TESTIEZ: Brand = {
  product: 'testiez',
  name: 'Testiez',
  baseDomain: process.env.TESTIEZ_BASE_DOMAIN || 'testiez.com',
  // Deliberately NOT falling back to SYSTEM_EMAIL: that is a zukvo.com address,
  // and a Testiez customer replying to support should never see the other brand.
  supportEmail: process.env.TESTIEZ_SUPPORT_EMAIL || 'support@testiez.com',
  systemEmail: process.env.TESTIEZ_SYSTEM_EMAIL || 'system@testiez.com',
  marketingUrl: 'https://testiez.com',
};

export const BRANDS: Record<Product, Brand> = {
  zukvo: ZUKVO,
  testiez: TESTIEZ,
};

export const DEFAULT_BRAND: Brand = ZUKVO;

export function brandFor(product: Product): Brand {
  return BRANDS[product] ?? DEFAULT_BRAND;
}

/**
 * Match a hostname to a product. Returns null when nothing matches, so callers
 * can fall through to the next resolution step rather than being handed a
 * default they cannot distinguish from a real match.
 *
 * Mirrors productFromHostname() in the frontend's lib/product.ts.
 */
export function productFromHost(hostOrOrigin?: string | null): Product | null {
  if (!hostOrOrigin) return null;

  // Accepts a bare host, a host:port, or a full origin.
  let host = hostOrOrigin.toLowerCase().trim();
  host = host.replace(/^https?:\/\//, '');
  host = host.split('/')[0].split(':')[0].replace(/\.$/, '');

  if (!host) return null;

  if (host === 'testiez.com' || host.endsWith('.testiez.com')) return 'testiez';
  if (host === 'testiez.localhost' || host.endsWith('.testiez.localhost')) return 'testiez';

  if (host === 'zukvo.com' || host.endsWith('.zukvo.com')) return 'zukvo';

  return null;
}

/**
 * Product a request is coming through, or null if it cannot be determined.
 *
 * Origin is preferred over Host because the API lives on its own domain — Host
 * describes the API, not the surface the user is looking at. Origin is present
 * on these calls because they are cross-origin XHR, but Referer and Host are
 * checked as fallbacks.
 *
 * Returns null rather than a default so callers can distinguish "this is Zukvo"
 * from "no idea". Anything making an ACCESS decision must treat null as unknown
 * and skip the check — defaulting to Zukvo there would 404 a Testiez-only tenant
 * on their own domain.
 */
export function productFromRequest(
  req: Pick<Request, 'get'> | null | undefined
): Product | null {
  if (!req) return null;

  const headerProduct = req.get('x-zukvo-product')?.toLowerCase();
  if (headerProduct === 'testiez' || headerProduct === 'zukvo') {
    return headerProduct as Product;
  }

  return (
    productFromHost(req.get('origin')) ??
    productFromHost(req.get('referer')) ??
    productFromHost(req.get('host'))
  );
}

/**
 * Brand for an in-flight request, falling back to Zukvo when undetermined.
 *
 * Safe for PRESENTATION (which logo, which name, which link host) where some
 * brand must be chosen. Do NOT use it to gate access — use productFromRequest()
 * and handle null explicitly.
 */
export function brandForRequest(req: Pick<Request, 'get'> | null | undefined): Brand {
  const product = productFromRequest(req);
  return product ? brandFor(product) : DEFAULT_BRAND;
}

/**
 * Brand inferred from what the tenant owns. For background work where no
 * request exists.
 *
 * Only a tenant holding Testiez and nothing else is branded as Testiez. Holding
 * both means they are a full-suite customer who also has a QA-only door, and
 * their operational email should come from the parent brand.
 */
export async function brandForTenant(tenantId: string): Promise<Brand> {
  try {
    const products = await getProducts(tenantId);
    if (products.length === 1 && products[0] === 'testiez') {
      return TESTIEZ;
    }
  } catch (err) {
    console.error('[brand] could not resolve tenant entitlements, defaulting:', err);
  }
  return DEFAULT_BRAND;
}

/**
 * Best available brand: the request if there is one, otherwise the tenant's
 * entitlements. Use this from anything that sends mail.
 */
export async function resolveBrand(
  req: Pick<Request, 'get'> | null | undefined,
  tenantId?: string | null
): Promise<Brand> {
  if (req) {
    const fromRequest =
      productFromHost(req.get('origin')) ??
      productFromHost(req.get('referer')) ??
      productFromHost(req.get('host'));
    if (fromRequest) return brandFor(fromRequest);
  }

  if (tenantId) return brandForTenant(tenantId);

  return DEFAULT_BRAND;
}

/**
 * The tenant's own front door on the correct brand, e.g. https://acme.testiez.com.
 *
 * Every tenant has its own subdomain, so links must point at the tenant's host
 * rather than a single shared FRONTEND_URL — that would send every recipient to
 * one tenant's domain regardless of who they are.
 */
export function tenantOrigin(subdomain: string | null | undefined, brand: Brand): string {
  const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
  if (isDev) {
    return process.env.FRONTEND_URL || 'http://localhost:3000';
  }

  if (subdomain) {
    return `https://${subdomain}.${brand.baseDomain}`;
  }

  return brand.marketingUrl;
}
