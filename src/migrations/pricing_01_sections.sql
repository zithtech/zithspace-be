-- Pricing & Plans — Table 01: pricing_sections
-- Top-level navigation grouping. NOT billable (navigation only).

CREATE OR REPLACE FUNCTION pricing_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS pricing_sections (
  id              BIGSERIAL PRIMARY KEY,
  code            VARCHAR(100) NOT NULL UNIQUE,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  display_order   INT NOT NULL DEFAULT 0,
  icon            VARCHAR(255),
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_sections_status_chk CHECK (status IN ('active', 'archived')),
  CONSTRAINT pricing_sections_code_format_chk CHECK (code ~ '^[A-Z][A-Z0-9_]*$')
);

CREATE INDEX IF NOT EXISTS idx_pricing_sections_status ON pricing_sections(status);
CREATE INDEX IF NOT EXISTS idx_pricing_sections_display_order ON pricing_sections(display_order);

DROP TRIGGER IF EXISTS pricing_sections_set_updated_at ON pricing_sections;
CREATE TRIGGER pricing_sections_set_updated_at
  BEFORE UPDATE ON pricing_sections
  FOR EACH ROW
  EXECUTE FUNCTION pricing_set_updated_at();
