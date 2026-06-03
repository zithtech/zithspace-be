-- Pricing & Plans — Migration 15: move plan_features from variant level to plan level
--
-- Before: pricing_plan_features.plan_variant_id (each variant could have its own
-- feature set — over-flexible, not how SaaS plans usually work)
-- After:  pricing_plan_features.plan_id (the plan defines features; variants
-- under the plan differ only by pricing and limits)
--
-- Safe to run because no production data exists. We DROP and recreate.
-- pricing_subscription_features rows from any test subscriptions stay valid
-- because they snapshot by feature_code, not by feature_id of the join row.

DROP TABLE IF EXISTS pricing_plan_features CASCADE;

CREATE TABLE pricing_plan_features (
  id                BIGSERIAL PRIMARY KEY,
  plan_id           BIGINT NOT NULL REFERENCES pricing_plans(id) ON DELETE RESTRICT,
  feature_id        BIGINT NOT NULL REFERENCES pricing_features(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_plan_features_unique UNIQUE (plan_id, feature_id)
);

CREATE INDEX idx_pricing_plan_features_plan_id
  ON pricing_plan_features(plan_id);
CREATE INDEX idx_pricing_plan_features_feature_id
  ON pricing_plan_features(feature_id);
