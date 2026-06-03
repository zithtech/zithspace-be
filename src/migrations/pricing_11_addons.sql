-- Pricing & Plans — Table 11: pricing_addons
-- Standalone purchasable extras. Each addon EITHER grants a feature OR extends a limit.
-- The XOR is enforced via CHECK so the model can't get into a weird state.
-- v1: single currency per addon (unlike plans which support multi-currency via prices table).

CREATE TABLE IF NOT EXISTS pricing_addons (
  id              BIGSERIAL PRIMARY KEY,
  feature_id      BIGINT NULL REFERENCES pricing_features(id) ON DELETE RESTRICT,
  limit_id        BIGINT NULL REFERENCES pricing_limits_catalog(id) ON DELETE RESTRICT,
  code            VARCHAR(100) NOT NULL UNIQUE,
  name            VARCHAR(255) NOT NULL,
  addon_type      VARCHAR(50) NOT NULL,
  billing_cycle   VARCHAR(20) NOT NULL,
  price           NUMERIC(18,2) NOT NULL,
  currency_code   VARCHAR(10) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_addons_status_chk CHECK (status IN ('active', 'archived')),
  CONSTRAINT pricing_addons_code_format_chk CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  CONSTRAINT pricing_addons_currency_chk CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT pricing_addons_price_chk CHECK (price >= 0),
  CONSTRAINT pricing_addons_cycle_chk CHECK (billing_cycle IN (
    'MONTHLY','QUARTERLY','YEARLY','ONE_TIME'
  )),
  CONSTRAINT pricing_addons_type_chk CHECK (addon_type IN ('FEATURE', 'LIMIT_EXTENSION')),
  -- XOR: FEATURE addons must reference a feature; LIMIT_EXTENSION must reference a limit.
  CONSTRAINT pricing_addons_grant_chk CHECK (
    (addon_type = 'FEATURE' AND feature_id IS NOT NULL AND limit_id IS NULL) OR
    (addon_type = 'LIMIT_EXTENSION' AND limit_id IS NOT NULL AND feature_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_pricing_addons_feature_id ON pricing_addons(feature_id);
CREATE INDEX IF NOT EXISTS idx_pricing_addons_limit_id ON pricing_addons(limit_id);
CREATE INDEX IF NOT EXISTS idx_pricing_addons_status ON pricing_addons(status);
CREATE INDEX IF NOT EXISTS idx_pricing_addons_type ON pricing_addons(addon_type);

DROP TRIGGER IF EXISTS pricing_addons_set_updated_at ON pricing_addons;
CREATE TRIGGER pricing_addons_set_updated_at
  BEFORE UPDATE ON pricing_addons
  FOR EACH ROW
  EXECUTE FUNCTION pricing_set_updated_at();
