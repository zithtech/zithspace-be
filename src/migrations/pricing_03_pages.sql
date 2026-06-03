-- Pricing & Plans — Table 03: pricing_pages
-- Routable pages inside a module. NOT billable (navigation only).

CREATE TABLE IF NOT EXISTS pricing_pages (
  id              BIGSERIAL PRIMARY KEY,
  module_id       BIGINT NOT NULL REFERENCES pricing_modules(id) ON DELETE RESTRICT,
  code            VARCHAR(100) NOT NULL UNIQUE,
  name            VARCHAR(255) NOT NULL,
  path            VARCHAR(500),
  description     TEXT,
  display_order   INT NOT NULL DEFAULT 0,
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_pages_status_chk CHECK (status IN ('active', 'archived')),
  CONSTRAINT pricing_pages_code_format_chk CHECK (code ~ '^[A-Z][A-Z0-9_]*$')
);

CREATE INDEX IF NOT EXISTS idx_pricing_pages_module_id ON pricing_pages(module_id);
CREATE INDEX IF NOT EXISTS idx_pricing_pages_status ON pricing_pages(status);
CREATE INDEX IF NOT EXISTS idx_pricing_pages_display_order ON pricing_pages(display_order);

DROP TRIGGER IF EXISTS pricing_pages_set_updated_at ON pricing_pages;
CREATE TRIGGER pricing_pages_set_updated_at
  BEFORE UPDATE ON pricing_pages
  FOR EACH ROW
  EXECUTE FUNCTION pricing_set_updated_at();
