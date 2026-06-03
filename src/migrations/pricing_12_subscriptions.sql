-- Pricing & Plans — Table 12: subscriptions + snapshot tables
-- The active relationship between a tenant and a plan variant.
-- Per the snapshot design, features + limits are copied into snapshot tables
-- at subscribe / renew time so editing plan_features / plan_limits never
-- affects existing customers retroactively.
--
-- Plan changes append a new row (status=active) and close the old one
-- (status=canceled) — never mutate. This gives a clean audit trail.

CREATE TABLE IF NOT EXISTS pricing_subscriptions (
  id                      BIGSERIAL PRIMARY KEY,
  tenant_id               TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  plan_variant_id         BIGINT NOT NULL REFERENCES pricing_plan_variants(id) ON DELETE RESTRICT,
  plan_variant_price_id   BIGINT NULL REFERENCES pricing_plan_variant_prices(id) ON DELETE SET NULL,
  currency_code           VARCHAR(10) NOT NULL,
  amount                  NUMERIC(18,2) NOT NULL DEFAULT 0,
  discount_amount         NUMERIC(18,2) NOT NULL DEFAULT 0,
  tax_amount              NUMERIC(18,2) NOT NULL DEFAULT 0,
  final_amount            NUMERIC(18,2) NOT NULL DEFAULT 0,
  status                  VARCHAR(20) NOT NULL DEFAULT 'active',
  starts_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at                 TIMESTAMPTZ NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_subscriptions_status_chk CHECK (status IN (
    'pending','trialing','active','past_due','canceled','expired'
  )),
  CONSTRAINT pricing_subscriptions_currency_chk CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT pricing_subscriptions_amount_chk CHECK (amount >= 0),
  CONSTRAINT pricing_subscriptions_discount_chk CHECK (discount_amount >= 0),
  CONSTRAINT pricing_subscriptions_tax_chk CHECK (tax_amount >= 0),
  CONSTRAINT pricing_subscriptions_final_chk CHECK (final_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_pricing_subscriptions_tenant_id ON pricing_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pricing_subscriptions_variant_id ON pricing_subscriptions(plan_variant_id);
CREATE INDEX IF NOT EXISTS idx_pricing_subscriptions_status ON pricing_subscriptions(status);
-- Only one *active* subscription per tenant (trialing also counts as occupying the slot).
-- Allows multiple canceled/expired rows for history.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pricing_subscriptions_one_active_per_tenant
  ON pricing_subscriptions(tenant_id)
  WHERE status IN ('pending','trialing','active','past_due');

DROP TRIGGER IF EXISTS pricing_subscriptions_set_updated_at ON pricing_subscriptions;
CREATE TRIGGER pricing_subscriptions_set_updated_at
  BEFORE UPDATE ON pricing_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION pricing_set_updated_at();


-- Snapshot: features entitled at the moment of subscribe / renew / plan change.
-- EntitlementService reads from this, never from pricing_plan_features.
CREATE TABLE IF NOT EXISTS pricing_subscription_features (
  id              BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES pricing_subscriptions(id) ON DELETE CASCADE,
  feature_id      BIGINT NULL REFERENCES pricing_features(id) ON DELETE SET NULL,
  feature_code    VARCHAR(150) NOT NULL,
  snapshotted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_subscription_features_unique UNIQUE (subscription_id, feature_code)
);
CREATE INDEX IF NOT EXISTS idx_pricing_subscription_features_sub_id
  ON pricing_subscription_features(subscription_id);
CREATE INDEX IF NOT EXISTS idx_pricing_subscription_features_code
  ON pricing_subscription_features(feature_code);


-- Snapshot: limit values at the moment of subscribe / renew / plan change.
CREATE TABLE IF NOT EXISTS pricing_subscription_limits (
  id              BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES pricing_subscriptions(id) ON DELETE CASCADE,
  limit_id        BIGINT NULL REFERENCES pricing_limits_catalog(id) ON DELETE SET NULL,
  limit_code      VARCHAR(100) NOT NULL,
  limit_value     VARCHAR(255) NOT NULL,
  snapshotted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_subscription_limits_unique UNIQUE (subscription_id, limit_code)
);
CREATE INDEX IF NOT EXISTS idx_pricing_subscription_limits_sub_id
  ON pricing_subscription_limits(subscription_id);
CREATE INDEX IF NOT EXISTS idx_pricing_subscription_limits_code
  ON pricing_subscription_limits(limit_code);
