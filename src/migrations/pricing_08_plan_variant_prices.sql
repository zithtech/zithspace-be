-- Pricing & Plans — Table 08: pricing_plan_variant_prices
-- Per-currency prices for a plan variant. Replaces the single price/currency
-- columns that the original spec had on plan_variants (multi-currency support).

CREATE TABLE IF NOT EXISTS pricing_plan_variant_prices (
  id                BIGSERIAL PRIMARY KEY,
  plan_variant_id   BIGINT NOT NULL REFERENCES pricing_plan_variants(id) ON DELETE RESTRICT,
  currency_code     VARCHAR(10) NOT NULL,
  base_price        NUMERIC(18,2) NOT NULL,
  setup_fee         NUMERIC(18,2) NOT NULL DEFAULT 0,
  status            VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_plan_variant_prices_status_chk CHECK (status IN ('active', 'archived')),
  CONSTRAINT pricing_plan_variant_prices_currency_chk CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT pricing_plan_variant_prices_base_chk CHECK (base_price >= 0),
  CONSTRAINT pricing_plan_variant_prices_setup_chk CHECK (setup_fee >= 0),
  CONSTRAINT pricing_plan_variant_prices_unique UNIQUE (plan_variant_id, currency_code)
);

CREATE INDEX IF NOT EXISTS idx_pricing_plan_variant_prices_variant_id
  ON pricing_plan_variant_prices(plan_variant_id);
CREATE INDEX IF NOT EXISTS idx_pricing_plan_variant_prices_currency
  ON pricing_plan_variant_prices(currency_code);
CREATE INDEX IF NOT EXISTS idx_pricing_plan_variant_prices_status
  ON pricing_plan_variant_prices(status);

DROP TRIGGER IF EXISTS pricing_plan_variant_prices_set_updated_at ON pricing_plan_variant_prices;
CREATE TRIGGER pricing_plan_variant_prices_set_updated_at
  BEFORE UPDATE ON pricing_plan_variant_prices
  FOR EACH ROW
  EXECUTE FUNCTION pricing_set_updated_at();
