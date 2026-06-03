import pool from "@/config/dbpool";

// Sentinel value used in pricing_plan_limits / pricing_subscription_limits /
// pricing_tenant_limit_overrides for "no cap".
const UNLIMITED = "UNLIMITED";

const ACTIVE_SUBSCRIPTION_STATUSES = ["pending", "trialing", "active", "past_due"];
const ACTIVE_ADDON_STATUSES = ["pending", "active"];

export interface FeatureEntitlement {
  code: string;
  enabled: boolean;
  source: "override" | "snapshot" | "addon";
  reason?: string | null;
}

export interface LimitEntitlement {
  code: string;
  value: string; // raw stored value, e.g. "30" or "UNLIMITED"
  numeric: number | null; // null means unlimited
  isUnlimited: boolean;
  source: "override" | "snapshot+addons" | "addons";
  unit?: string | null;
  breakdown: {
    snapshotValue?: string;
    addonContributions?: number;
    overrideValue?: string;
    overrideReason?: string | null;
  };
}

export interface TenantEntitlements {
  tenantId: string;
  resolvedAt: Date;
  activeSubscriptionId: string | null;
  features: Record<string, FeatureEntitlement>;
  limits: Record<string, LimitEntitlement>;
}

interface CachedEntry {
  data: TenantEntitlements;
  expiresAt: number;
}

/**
 * EntitlementService — the single source of truth for "can this tenant use X?".
 *
 * Resolution rules (locked early in the design):
 *
 *   Features:
 *     1. tenant_feature_override (force ON / force OFF) wins
 *     2. else: active subscription's snapshotted features (snapshot_features)
 *     3. else: any active tenant_addon whose addon grants this feature
 *     4. else: not entitled
 *
 *   Limits:
 *     1. tenant_limit_override wins (absolute — snapshot + add-ons ignored)
 *     2. else: snapshot value + sum of active LIMIT_EXTENSION addon quantities
 *        for the same limit. If snapshot is UNLIMITED, result is unlimited.
 *
 * The service intentionally never reads pricing_plan_features / pricing_plan_limits
 * directly — those are the *catalog* view, not the runtime view.
 */
export class EntitlementService {
  private static cache = new Map<string, CachedEntry>();
  private static TTL_MS = 60_000;

  static invalidate(tenantId: string): void {
    EntitlementService.cache.delete(tenantId);
  }
  static invalidateAll(): void {
    EntitlementService.cache.clear();
  }

  static async getAllForTenant(
    tenantId: string,
    opts: { skipCache?: boolean } = {}
  ): Promise<TenantEntitlements> {
    if (!opts.skipCache) {
      const hit = EntitlementService.cache.get(tenantId);
      if (hit && hit.expiresAt > Date.now()) return hit.data;
    }
    const resolved = await EntitlementService.resolve(tenantId);
    EntitlementService.cache.set(tenantId, {
      data: resolved,
      expiresAt: Date.now() + EntitlementService.TTL_MS,
    });
    return resolved;
  }

  static async hasFeature(tenantId: string, featureCode: string): Promise<boolean> {
    const e = await EntitlementService.getAllForTenant(tenantId);
    const f = e.features[featureCode];
    return !!f && f.enabled;
  }

  static async getLimit(tenantId: string, limitCode: string): Promise<LimitEntitlement | null> {
    const e = await EntitlementService.getAllForTenant(tenantId);
    return e.limits[limitCode] ?? null;
  }

  // ------------------------------------------------------------------
  // Internal resolver — one fan-out query batch per call.
  // ------------------------------------------------------------------
  private static async resolve(tenantId: string): Promise<TenantEntitlements> {
    const [
      subResult,
      featureOverridesResult,
      limitOverridesResult,
      addonsResult,
    ] = await Promise.all([
      pool.query<{ id: string }>(
        `SELECT id FROM pricing_subscriptions
         WHERE tenant_id = $1 AND status = ANY($2)
         ORDER BY starts_at DESC NULLS LAST, created_at DESC
         LIMIT 1`,
        [tenantId, ACTIVE_SUBSCRIPTION_STATUSES]
      ),
      pool.query<{
        feature_code: string | null;
        is_enabled: boolean;
        reason: string | null;
      }>(
        `SELECT f.code AS feature_code, o.is_enabled, o.reason
         FROM pricing_tenant_feature_overrides o
         JOIN pricing_features f ON f.id = o.feature_id
         WHERE o.tenant_id = $1`,
        [tenantId]
      ),
      pool.query<{
        limit_code: string | null;
        limit_unit: string | null;
        limit_value: string;
        reason: string | null;
      }>(
        `SELECT l.code AS limit_code, l.unit AS limit_unit,
                o.limit_value, o.reason
         FROM pricing_tenant_limit_overrides o
         JOIN pricing_limits_catalog l ON l.id = o.limit_id
         WHERE o.tenant_id = $1`,
        [tenantId]
      ),
      pool.query<{
        addon_type: string;
        feature_code: string | null;
        limit_code: string | null;
        limit_unit: string | null;
        quantity: number;
      }>(
        `SELECT a.addon_type,
                f.code AS feature_code,
                l.code AS limit_code, l.unit AS limit_unit,
                ta.quantity
         FROM pricing_tenant_addons ta
         JOIN pricing_addons a ON a.id = ta.addon_id
         LEFT JOIN pricing_features f ON f.id = a.feature_id
         LEFT JOIN pricing_limits_catalog l ON l.id = a.limit_id
         WHERE ta.tenant_id = $1 AND ta.status = ANY($2)`,
        [tenantId, ACTIVE_ADDON_STATUSES]
      ),
    ]);

    const activeSubscriptionId = subResult.rows[0]?.id ?? null;

    // Snapshot features + limits (only if there's an active sub)
    let snapshotFeatures: { feature_code: string }[] = [];
    let snapshotLimits: { limit_code: string; limit_value: string; limit_unit: string | null }[] = [];
    if (activeSubscriptionId) {
      const [fRes, lRes] = await Promise.all([
        pool.query<{ feature_code: string }>(
          `SELECT feature_code FROM pricing_subscription_features WHERE subscription_id = $1`,
          [activeSubscriptionId]
        ),
        pool.query<{ limit_code: string; limit_value: string; limit_unit: string | null }>(
          `SELECT sl.limit_code, sl.limit_value, l.unit AS limit_unit
           FROM pricing_subscription_limits sl
           LEFT JOIN pricing_limits_catalog l ON l.id = sl.limit_id
           WHERE sl.subscription_id = $1`,
          [activeSubscriptionId]
        ),
      ]);
      snapshotFeatures = fRes.rows;
      snapshotLimits = lRes.rows;
    }

    // -------- Resolve features --------
    const features: Record<string, FeatureEntitlement> = {};

    // Overrides win
    for (const row of featureOverridesResult.rows) {
      if (!row.feature_code) continue;
      features[row.feature_code] = {
        code: row.feature_code,
        enabled: row.is_enabled,
        source: "override",
        reason: row.reason,
      };
    }
    // Snapshot fills in (unless overridden)
    for (const row of snapshotFeatures) {
      if (features[row.feature_code]) continue;
      features[row.feature_code] = {
        code: row.feature_code,
        enabled: true,
        source: "snapshot",
      };
    }
    // Active FEATURE addons grant features (unless already present)
    for (const row of addonsResult.rows) {
      if (row.addon_type !== "FEATURE" || !row.feature_code) continue;
      if (features[row.feature_code]) continue;
      features[row.feature_code] = {
        code: row.feature_code,
        enabled: true,
        source: "addon",
      };
    }

    // -------- Resolve limits --------
    // Step 1: bucket active LIMIT_EXTENSION addons by limit_code
    const addonExtensions = new Map<string, { quantity: number; unit: string | null }>();
    for (const row of addonsResult.rows) {
      if (row.addon_type !== "LIMIT_EXTENSION" || !row.limit_code) continue;
      const existing = addonExtensions.get(row.limit_code);
      if (existing) {
        existing.quantity += Number(row.quantity);
      } else {
        addonExtensions.set(row.limit_code, {
          quantity: Number(row.quantity),
          unit: row.limit_unit,
        });
      }
    }

    const limits: Record<string, LimitEntitlement> = {};

    // Overrides win
    for (const row of limitOverridesResult.rows) {
      if (!row.limit_code) continue;
      const isUnl = row.limit_value === UNLIMITED;
      limits[row.limit_code] = {
        code: row.limit_code,
        value: row.limit_value,
        numeric: isUnl ? null : parseLimitInt(row.limit_value),
        isUnlimited: isUnl,
        source: "override",
        unit: row.limit_unit,
        breakdown: {
          overrideValue: row.limit_value,
          overrideReason: row.reason,
        },
      };
    }

    // Snapshot + addon stack (unless overridden)
    for (const row of snapshotLimits) {
      if (limits[row.limit_code]) continue;
      const ext = addonExtensions.get(row.limit_code);
      if (row.limit_value === UNLIMITED) {
        limits[row.limit_code] = {
          code: row.limit_code,
          value: UNLIMITED,
          numeric: null,
          isUnlimited: true,
          source: "snapshot+addons",
          unit: row.limit_unit ?? ext?.unit ?? null,
          breakdown: {
            snapshotValue: row.limit_value,
            addonContributions: ext?.quantity ?? 0,
          },
        };
        continue;
      }
      const base = parseLimitInt(row.limit_value) ?? 0;
      const addons = ext?.quantity ?? 0;
      const total = base + addons;
      limits[row.limit_code] = {
        code: row.limit_code,
        value: String(total),
        numeric: total,
        isUnlimited: false,
        source: "snapshot+addons",
        unit: row.limit_unit ?? ext?.unit ?? null,
        breakdown: {
          snapshotValue: row.limit_value,
          addonContributions: addons,
        },
      };
    }

    // Limits not in snapshot but with active extension addons (no plan baseline → addons-only)
    for (const [code, ext] of addonExtensions.entries()) {
      if (limits[code]) continue;
      limits[code] = {
        code,
        value: String(ext.quantity),
        numeric: ext.quantity,
        isUnlimited: false,
        source: "addons",
        unit: ext.unit,
        breakdown: { addonContributions: ext.quantity },
      };
    }

    return {
      tenantId,
      resolvedAt: new Date(),
      activeSubscriptionId,
      features,
      limits,
    };
  }
}

function parseLimitInt(v: string): number | null {
  if (!v) return null;
  const trimmed = v.trim();
  if (trimmed === UNLIMITED) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}
