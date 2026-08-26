// src/modules/entitlements/entitlements.service.ts
//
// WHICH BRAND DOOR MAY THIS TENANT ENTER?
//
// That is the whole job now, and it is the one question nothing else models.
//
//   PRODUCT   a sellable application: 'zukvo' | 'testiez'. Stored as rows in
//             ent_tenant_entitlements. Used by the two public resolve
//             endpoints so acme.testiez.com only resolves for a tenant that
//             actually holds Testiez.
//
// WHAT THEY CAN USE is a different question, and this module no longer answers
// it. That is the admin control plane: admin_feature_catalog says what exists,
// product_features says what each product sells, plan_features says what a plan
// grants, and modules/subscriptions resolves the intersection per request. This
// file used to carry a hand-written product → capability map, which meant the
// same fact lived in TypeScript and in editable data; the two drifted the first
// time somebody changed a plan.
//
// UNMANAGED MEANS FULL ACCESS. A tenant with no grants is unconstrained, not
// locked out — entitlements are opt-in. See hasProduct().
//
// None of this answers "may this USER do it" — that stays with RBAC. Both must
// pass: entitlement gates the tenant, permission gates the person.

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

/**
 * What happens when the control plane is UNREACHABLE (an exception, not a
 * definite "not entitled").
 *
 *   FAIL_OPEN (default) — serve the request. Availability over strictness: a
 *     gate in front of the whole API must not take the product down when a
 *     control-plane call times out.
 *   fail closed — set ENTITLEMENTS_FAIL_OPEN=false to refuse instead, for
 *     environments where a missed entitlement check is worse than an outage.
 *
 * A deliberate, per-environment decision — read once at import, like ENFORCING.
 */
export const FAIL_OPEN = process.env.ENTITLEMENTS_FAIL_OPEN !== 'false';

export type Product = 'zukvo' | 'testiez';

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


  const entry: CacheEntry = {
    products,
    expiresAtMs: Date.now() + CACHE_TTL_MS,
  };
  cache.set(tenantId, entry);
  return entry;
}

/** Products the tenant currently holds. */
export async function getProducts(tenantId: string): Promise<Product[]> {
  return (await load(tenantId)).products;
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

