-- Pricing & Plans — Table 02: pricing_modules
-- Mid-level navigation grouping under pricing_sections. NOT billable.

CREATE TABLE IF NOT EXISTS pricing_modules (
  id              BIGSERIAL PRIMARY KEY,
  section_id      BIGINT NOT NULL REFERENCES pricing_sections(id) ON DELETE RESTRICT,
  code            VARCHAR(100) NOT NULL UNIQUE,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  display_order   INT NOT NULL DEFAULT 0,
  icon            VARCHAR(255),
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_modules_status_chk CHECK (status IN ('active', 'archived')),
  CONSTRAINT pricing_modules_code_format_chk CHECK (code ~ '^[A-Z][A-Z0-9_]*$')
);

CREATE INDEX IF NOT EXISTS idx_pricing_modules_section_id ON pricing_modules(section_id);
CREATE INDEX IF NOT EXISTS idx_pricing_modules_status ON pricing_modules(status);
CREATE INDEX IF NOT EXISTS idx_pricing_modules_display_order ON pricing_modules(display_order);

DROP TRIGGER IF EXISTS pricing_modules_set_updated_at ON pricing_modules;
CREATE TRIGGER pricing_modules_set_updated_at
  BEFORE UPDATE ON pricing_modules
  FOR EACH ROW
  EXECUTE FUNCTION pricing_set_updated_at();
