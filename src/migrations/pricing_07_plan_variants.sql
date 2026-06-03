-- Pricing & Plans — Table 07: pricing_plan_variants
-- A plan can have multiple variants (e.g. STARTER_MONTHLY, STARTER_YEARLY).
-- Prices are stored separately in pricing_plan_variant_prices (multi-currency).

CREATE TABLE IF NOT EXISTS pricing_plan_variants (
  id              BIGSERIAL PRIMARY KEY,
  plan_id         BIGINT NOT NULL REFERENCES pricing_plans(id) ON DELETE RESTRICT,
  code            VARCHAR(150) NOT NULL UNIQUE,
  name            VARCHAR(255) NOT NULL,
  billing_cycle   VARCHAR(20) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_plan_variants_status_chk CHECK (status IN ('active', 'archived')),
  CONSTRAINT pricing_plan_variants_code_format_chk CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  CONSTRAINT pricing_plan_variants_cycle_chk CHECK (billing_cycle IN (
    'MONTHLY','QUARTERLY','YEARLY','ONE_TIME'
  ))
);

CREATE INDEX IF NOT EXISTS idx_pricing_plan_variants_plan_id ON pricing_plan_variants(plan_id);
CREATE INDEX IF NOT EXISTS idx_pricing_plan_variants_status ON pricing_plan_variants(status);

DROP TRIGGER IF EXISTS pricing_plan_variants_set_updated_at ON pricing_plan_variants;
CREATE TRIGGER pricing_plan_variants_set_updated_at
  BEFORE UPDATE ON pricing_plan_variants
  FOR EACH ROW
  EXECUTE FUNCTION pricing_set_updated_at();
