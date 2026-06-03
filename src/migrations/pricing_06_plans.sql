-- Pricing & Plans — Table 06: pricing_plans
-- Plan definitions. Variants (with billing cycle + price) are added separately.

CREATE TABLE IF NOT EXISTS pricing_plans (
  id              BIGSERIAL PRIMARY KEY,
  code            VARCHAR(100) NOT NULL UNIQUE,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  display_order   INT NOT NULL DEFAULT 0,
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_plans_status_chk CHECK (status IN ('active', 'archived')),
  CONSTRAINT pricing_plans_code_format_chk CHECK (code ~ '^[A-Z][A-Z0-9_]*$')
);

CREATE INDEX IF NOT EXISTS idx_pricing_plans_status ON pricing_plans(status);
CREATE INDEX IF NOT EXISTS idx_pricing_plans_display_order ON pricing_plans(display_order);

DROP TRIGGER IF EXISTS pricing_plans_set_updated_at ON pricing_plans;
CREATE TRIGGER pricing_plans_set_updated_at
  BEFORE UPDATE ON pricing_plans
  FOR EACH ROW
  EXECUTE FUNCTION pricing_set_updated_at();
