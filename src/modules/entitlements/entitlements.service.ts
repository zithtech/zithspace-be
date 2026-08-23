// src/modules/entitlements/entitlements.service.ts
//
// Resolves what a tenant is allowed to reach.
//
// TWO LEVELS, deliberately kept apart:
//
//   PRODUCT     a sellable SKU, stored as rows in ent_tenant_entitlements.
//               'zukvo' (full suite) | 'testiez' (standalone QA).
//
//   CAPABILITY  a functional area the app gates on — mirrors the top-level
//               nav modules. Derived from products by the map below.
//
// Products are DATA (they change when someone buys something). The product →
// capability map is CODE (it changes when you re-package what a SKU includes).
// Keeping them separate means re-packaging never needs a data migration, and
// granting a product is always a single INSERT.
//
// This module answers "what did they buy". It does NOT answer "what is this
// user allowed to do" — that stays with RBAC/permissions, which is a per-user
// question. Both must pass: entitlement gates the tenant, permissions gate the
// person.

import { withTenant } from './db/pool';

/**
 * Staged-rollout kill switch, shared by every entitlement consumer.
 *
 * Set ENTITLEMENTS_ENFORCEMENT=off to log what WOULD be blocked without
 * blocking it — the safe way to deploy this before db/ddl/tenant_entitlements.sql
 * has been run by hand, when ent_tenant_entitlements does not exist yet and
 * every lookup throws.
 *
 * Read once at import: a deploy-time decision, not something to flip live
 * under load.
 */
export const ENFORCING = process.env.ENTITLEMENTS_ENFORCEMENT !== 'off';

export type Product = 'zukvo' | 'testiez';

/**
 * THE single vocabulary for "what may this tenant reach".
 *
 * One list drives three things that must never disagree:
 *   · which nav modules and items render          (client)
 *   · which URLs the route guard permits          (client)
 *   · which API prefixes are served               (server, authoritative)
 *
 * Before this was unified there were two vocabularies — a `products` field on
 * nav items and these capabilities — and only one of them reached the API. The
 * result was that hiding a feature from the nav removed its route guard while
 * leaving its API wide open. One vocabulary makes that class of bug impossible.
 *
 * KEEP IN SYNC with `Capability` in zukvo-fe/src/lib/product.ts.
 *
 * Two tiers, same namespace:
 *   MODULE   a top-level nav module (home, work, hrms, …)
 *   FEATURE  something inside a module that is sold separately, because the SKU
 *            boundary cuts THROUGH Work and Admin — Testiez has Tickets and
 *            Projects but not Proposals or Leads.
 *
 * Anything with no capability attached is available wherever its module is;
 * only exclusions need naming.
 */
export type Capability =
  // ── Modules ──
  | 'home'
  | 'my_hub'
  | 'work'
  | 'hrms'
  | 'finance'
  | 'admin'
  | 'rec_suite'
  // ── Features inside Work ──
  | 'proposals'
  | 'leads'
  | 'squads'
  | 'timesheet'
  | 'daily_updates'
  // ── Features inside Admin ──
  | 'clients'
  | 'chrome_extension'
  // ── Standalone ──
  | 'chat'
  | 'skills'
  | 'bookmarks';

/**
 * Capabilities every tenant gets regardless of product. Somewhere to land after
 * login is table stakes; My Hub is NOT baseline — it is the personal HR surface
 * (payslips, leave, claims) and belongs to the suite, not to Testiez.
 */
const BASELINE_CAPABILITIES: readonly Capability[] = ['home'];

/**
 * What each SKU includes.
 *
 * Note there is no 'qa' capability: BOTH products ship QA Space, so gating on it
 * would gate nothing. Testiez is a delivery product — Tickets, Projects,
 * Document Hub, Time Tracking and QA Space — minus the people-and-money half of
 * the suite and the commercial pieces of Work.
 */
const PRODUCT_CAPABILITIES: Record<Product, readonly Capability[]> = {
  zukvo: [
    'my_hub',
    'work',
    'hrms',
    'finance',
    'admin',
    'rec_suite',
    'proposals',
    'leads',
    'squads',
    'timesheet',
    'daily_updates',
    'clients',
    'chrome_extension',
    'chat',
    'skills',
    'bookmarks',
  ],
  testiez: ['work', 'admin'],
};

export interface Entitlement {
  product: Product;
  status: 'active' | 'suspended' | 'expired';
  startsAt: Date;
  expiresAt: Date | null;
}

// ── Cache ───────────────────────────────────────────────────────────────────
// Entitlement is checked on effectively every request, so it must not be a DB
// round-trip each time. Grants change rarely (a sale, a cancellation), so a
// short in-process TTL is the right trade: worst case a tenant keeps access for
// TTL seconds after revocation. Call invalidateTenant() on any write to make
// that window zero on the instance that handled the write; other instances
// converge within the TTL.

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  products: Product[];
  capabilities: Set<Capability>;
  expiresAtMs: number;
}

const cache = new Map<string, CacheEntry>();

export function invalidateTenant(tenantId: string): void {
  cache.delete(tenantId);
}

export function invalidateAll(): void {
  cache.clear();
}

// ── Reads ───────────────────────────────────────────────────────────────────

interface EntitlementRow {
  product: Product;
  status: Entitlement['status'];
  starts_at: Date;
  expires_at: Date | null;
}

/**
 * Products currently in force for a tenant.
 *
 * `expires_at` in the past counts as expired no matter what `status` says, so
 * a lapsed trial closes itself without a sweeper job having to run on time.
 */
async function fetchActiveProducts(tenantId: string): Promise<Product[]> {
  const rows = await withTenant(tenantId, async (client) => {
    const { rows } = await client.query<EntitlementRow>(
      `SELECT product, status, starts_at, expires_at
         FROM ent_tenant_entitlements
        WHERE tenant_id = $1
          AND status = 'active'
          AND starts_at <= now()
          AND (expires_at IS NULL OR expires_at > now())`,
      [tenantId]
    );
    return rows;
  });

  return rows.map((r) => r.product);
}

async function load(tenantId: string): Promise<CacheEntry> {
  const cached = cache.get(tenantId);
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached;
  }

  const products = await fetchActiveProducts(tenantId);

  // Same rule as capabilitiesFor(): no grants means unmanaged, not restricted.
  const capabilities = new Set<Capability>(capabilitiesFor(products));

  const entry: CacheEntry = {
    products,
    capabilities,
    expiresAtMs: Date.now() + CACHE_TTL_MS,
  };
  cache.set(tenantId, entry);
  return entry;
}

/** Products the tenant currently holds. */
export async function getProducts(tenantId: string): Promise<Product[]> {
  return (await load(tenantId)).products;
}

/** Every capability the tenant's products add up to, baseline included. */
export async function getCapabilities(tenantId: string): Promise<Capability[]> {
  return [...(await load(tenantId)).capabilities];
}

export async function hasCapability(tenantId: string, capability: Capability): Promise<boolean> {
  return (await load(tenantId)).capabilities.has(capability);
}

/**
 * Does the tenant hold this product?
 *
 * An UNMANAGED tenant (no grants at all) holds every product, for the same
 * reason it holds every capability — entitlements are opt-in. This matters most
 * at the two public resolve endpoints: without it, a Zukvo tenant created by
 * signup would 404 on its own zukvo.com subdomain, because it has no grant row
 * proving it is allowed through that door.
 */
export async function hasProduct(tenantId: string, product: Product): Promise<boolean> {
  const { products } = await load(tenantId);
  if (products.length === 0) return true;
  return products.includes(product);
}

// ── Writes ──────────────────────────────────────────────────────────────────
// Used by the provisioning script and, later, by billing webhooks.

/**
 * Grant a product. Idempotent — re-granting an existing product reactivates it
 * and clears any expiry, which is exactly what "they resubscribed" means.
 *
 * Upgrading a Testiez tenant to the full suite is one call to this. Their QA
 * data is untouched because both products always read the same tables.
 */
export async function grantProduct(
  tenantId: string,
  product: Product,
  opts: { source?: string; expiresAt?: Date | null } = {}
): Promise<void> {
  const { source = 'manual', expiresAt = null } = opts;

  await withTenant(tenantId, async (client) => {
    await client.query(
      `INSERT INTO ent_tenant_entitlements (tenant_id, product, status, source, expires_at)
            VALUES ($1, $2, 'active', $3, $4)
       ON CONFLICT (tenant_id, product) DO UPDATE
            SET status     = 'active',
                source     = EXCLUDED.source,
                expires_at = EXCLUDED.expires_at,
                updated_at = now()`,
      [tenantId, product, source, expiresAt]
    );
  });

  invalidateTenant(tenantId);
}

/**
 * Revoke a product. The row is kept (status flipped) rather than deleted, so
 * the grant history survives for billing disputes and win-back campaigns.
 */
export async function revokeProduct(tenantId: string, product: Product): Promise<void> {
  await withTenant(tenantId, async (client) => {
    await client.query(
      `UPDATE ent_tenant_entitlements
          SET status = 'suspended', updated_at = now()
        WHERE tenant_id = $1 AND product = $2`,
      [tenantId, product]
    );
  });

  invalidateTenant(tenantId);
}

export const ALL_PRODUCTS: readonly Product[] = ['zukvo', 'testiez'];

/**
 * ALL capabilities. What an UNMANAGED tenant gets — see capabilitiesFor().
 */
const ALL_CAPABILITIES: readonly Capability[] = [
  'home', 'my_hub', 'work', 'hrms', 'finance', 'admin', 'rec_suite',
  'proposals', 'leads', 'squads', 'timesheet', 'daily_updates',
  'clients', 'chrome_extension', 'chat', 'skills', 'bookmarks',
];

/**
 * Capabilities for a set of granted products.
 *
 * NO GRANTS MEANS FULL ACCESS, NOT NO ACCESS. This is the single most important
 * rule in this module.
 *
 * Entitlements are opt-in: a tenant is constrained only once somebody has
 * deliberately granted it products. Tenants that predate this table — and, more
 * importantly, every tenant created by signup, which does not yet write grants —
 * must behave exactly as they did before entitlements existed. Treating an
 * absent row as "entitled to nothing" silently 403'd new Zukvo tenants out of
 * HRMS and Finance, the opposite of what an additive feature should do.
 *
 * Fail-closed still applies to a lookup that ERRORS (see the middleware); this
 * is about a lookup that succeeds and finds nothing.
 */
export function capabilitiesFor(products: Product[]): Capability[] {
  if (products.length === 0) return [...ALL_CAPABILITIES];

  const set = new Set<Capability>(BASELINE_CAPABILITIES);
  for (const product of products) {
    for (const capability of PRODUCT_CAPABILITIES[product] ?? []) set.add(capability);
  }
  return [...set];
}

/** Legacy name kept for existing call sites. */
export const capabilitiesForProducts = capabilitiesFor;
