-- Pricing & Plans — Table 10: pricing_plan_limits
-- Per-variant assignment of values to catalog limits.
-- limit_value is VARCHAR(255) to stay flexible. Convention:
--   * Numeric strings ("30", "500000") for normal caps.
--   * "UNLIMITED" sentinel for no cap. EntitlementService treats this as Infinity.
-- This is the *current* offering. Subscriptions snapshot at subscribe / renew.

CREATE TABLE IF NOT EXISTS pricing_plan_limits (
  id                BIGSERIAL PRIMARY KEY,
  plan_variant_id   BIGINT NOT NULL REFERENCES pricing_plan_variants(id) ON DELETE RESTRICT,
  limit_id          BIGINT NOT NULL REFERENCES pricing_limits_catalog(id) ON DELETE RESTRICT,
  limit_value       VARCHAR(255) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_plan_limits_unique UNIQUE (plan_variant_id, limit_id)
);

CREATE INDEX IF NOT EXISTS idx_pricing_plan_limits_variant_id
  ON pricing_plan_limits(plan_variant_id);
CREATE INDEX IF NOT EXISTS idx_pricing_plan_limits_limit_id
  ON pricing_plan_limits(limit_id);

DROP TRIGGER IF EXISTS pricing_plan_limits_set_updated_at ON pricing_plan_limits;
CREATE TRIGGER pricing_plan_limits_set_updated_at
  BEFORE UPDATE ON pricing_plan_limits
  FOR EACH ROW
  EXECUTE FUNCTION pricing_set_updated_at();
