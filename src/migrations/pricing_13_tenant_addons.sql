-- Pricing & Plans — Table 13: pricing_tenant_addons
-- Purchased add-ons for a tenant. Snapshots the addon's code, unit_price and
-- currency_code at purchase time so the row remains correct if the addon is
-- later renamed, repriced or archived.
--
-- Multiple rows for the same addon are allowed (each purchase is its own row).
-- EntitlementService dedupes FEATURE grants and SUMs LIMIT_EXTENSION quantities.

CREATE TABLE IF NOT EXISTS pricing_tenant_addons (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  addon_id        BIGINT NULL REFERENCES pricing_addons(id) ON DELETE SET NULL,
  addon_code      VARCHAR(100) NOT NULL,
  quantity        INT NOT NULL DEFAULT 1,
  unit_price      NUMERIC(18,2) NOT NULL,
  total_price     NUMERIC(18,2) NOT NULL,
  currency_code   VARCHAR(10) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  starts_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at         TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_tenant_addons_status_chk CHECK (status IN (
    'pending','active','canceled','expired'
  )),
  CONSTRAINT pricing_tenant_addons_quantity_chk CHECK (quantity > 0),
  CONSTRAINT pricing_tenant_addons_unit_price_chk CHECK (unit_price >= 0),
  CONSTRAINT pricing_tenant_addons_total_price_chk CHECK (total_price >= 0),
  CONSTRAINT pricing_tenant_addons_currency_chk CHECK (currency_code ~ '^[A-Z]{3}$')
);

CREATE INDEX IF NOT EXISTS idx_pricing_tenant_addons_tenant_id ON pricing_tenant_addons(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pricing_tenant_addons_addon_id  ON pricing_tenant_addons(addon_id);
CREATE INDEX IF NOT EXISTS idx_pricing_tenant_addons_status    ON pricing_tenant_addons(status);
CREATE INDEX IF NOT EXISTS idx_pricing_tenant_addons_code      ON pricing_tenant_addons(addon_code);

DROP TRIGGER IF EXISTS pricing_tenant_addons_set_updated_at ON pricing_tenant_addons;
CREATE TRIGGER pricing_tenant_addons_set_updated_at
  BEFORE UPDATE ON pricing_tenant_addons
  FOR EACH ROW
  EXECUTE FUNCTION pricing_set_updated_at();
