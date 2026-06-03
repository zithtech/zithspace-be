-- Pricing & Plans — Table 05: pricing_limits_catalog
-- Catalog of metered limit *types*. Plans assign values via pricing_plan_limits.
-- Spec extended with description/status/updated_at to match other catalog tables.

CREATE TABLE IF NOT EXISTS pricing_limits_catalog (
  id              BIGSERIAL PRIMARY KEY,
  code            VARCHAR(100) NOT NULL UNIQUE,
  name            VARCHAR(255) NOT NULL,
  unit            VARCHAR(50) NOT NULL,
  description     TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_limits_catalog_status_chk CHECK (status IN ('active', 'archived')),
  CONSTRAINT pricing_limits_catalog_code_format_chk CHECK (code ~ '^[A-Z][A-Z0-9_]*$')
);

CREATE INDEX IF NOT EXISTS idx_pricing_limits_catalog_status ON pricing_limits_catalog(status);

DROP TRIGGER IF EXISTS pricing_limits_catalog_set_updated_at ON pricing_limits_catalog;
CREATE TRIGGER pricing_limits_catalog_set_updated_at
  BEFORE UPDATE ON pricing_limits_catalog
  FOR EACH ROW
  EXECUTE FUNCTION pricing_set_updated_at();
