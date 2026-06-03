-- Pricing & Plans — Table 04: pricing_features
-- The billable / controllable atom. Plans entitle features. Add-ons grant features.
-- Scope (section/module/page) is optional — features can be cross-cutting.

CREATE TABLE IF NOT EXISTS pricing_features (
  id              BIGSERIAL PRIMARY KEY,
  section_id      BIGINT NULL REFERENCES pricing_sections(id) ON DELETE RESTRICT,
  module_id       BIGINT NULL REFERENCES pricing_modules(id) ON DELETE RESTRICT,
  page_id         BIGINT NULL REFERENCES pricing_pages(id) ON DELETE RESTRICT,
  code            VARCHAR(150) NOT NULL UNIQUE,
  name            VARCHAR(255) NOT NULL,
  feature_type    VARCHAR(50) NOT NULL,
  description     TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_features_status_chk CHECK (status IN ('active', 'archived')),
  CONSTRAINT pricing_features_code_format_chk CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  CONSTRAINT pricing_features_type_chk CHECK (feature_type IN (
    'MODULE','PAGE','ACTION','AI','AUTOMATION','LIMIT','INTEGRATION','ADDON'
  ))
);

CREATE INDEX IF NOT EXISTS idx_pricing_features_section_id ON pricing_features(section_id);
CREATE INDEX IF NOT EXISTS idx_pricing_features_module_id  ON pricing_features(module_id);
CREATE INDEX IF NOT EXISTS idx_pricing_features_page_id    ON pricing_features(page_id);
CREATE INDEX IF NOT EXISTS idx_pricing_features_status     ON pricing_features(status);
CREATE INDEX IF NOT EXISTS idx_pricing_features_type       ON pricing_features(feature_type);

DROP TRIGGER IF EXISTS pricing_features_set_updated_at ON pricing_features;
CREATE TRIGGER pricing_features_set_updated_at
  BEFORE UPDATE ON pricing_features
  FOR EACH ROW
  EXECUTE FUNCTION pricing_set_updated_at();
