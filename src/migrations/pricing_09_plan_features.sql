-- Pricing & Plans — Table 09: pricing_plan_features
-- Entitlement join. Row presence means the variant entitles the feature.
-- (Per design delta we dropped is_enabled to avoid "what does false mean" ambiguity.)
-- This is the *current* offering. Subscriptions snapshot from this at subscribe / renew.

CREATE TABLE IF NOT EXISTS pricing_plan_features (
  id                BIGSERIAL PRIMARY KEY,
  plan_variant_id   BIGINT NOT NULL REFERENCES pricing_plan_variants(id) ON DELETE RESTRICT,
  feature_id        BIGINT NOT NULL REFERENCES pricing_features(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_plan_features_unique UNIQUE (plan_variant_id, feature_id)
);

CREATE INDEX IF NOT EXISTS idx_pricing_plan_features_variant_id
  ON pricing_plan_features(plan_variant_id);
CREATE INDEX IF NOT EXISTS idx_pricing_plan_features_feature_id
  ON pricing_plan_features(feature_id);
