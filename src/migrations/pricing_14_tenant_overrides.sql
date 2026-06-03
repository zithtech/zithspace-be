-- Pricing & Plans — Table 14: tenant overrides
-- Enterprise escape hatch. Wins over snapshots and add-ons in EntitlementService.
-- A feature override can force-ON (is_enabled=true) or force-OFF (is_enabled=false)
-- a feature regardless of what the subscription snapshot says.
-- A limit override sets an absolute value (snapshot + add-ons ignored for that limit).
-- Spec extended with a `reason` text column for audit; not required but recommended.

CREATE TABLE IF NOT EXISTS pricing_tenant_feature_overrides (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  feature_id      BIGINT NOT NULL REFERENCES pricing_features(id) ON DELETE RESTRICT,
  is_enabled      BOOLEAN NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_tenant_feature_overrides_unique UNIQUE (tenant_id, feature_id)
);

CREATE INDEX IF NOT EXISTS idx_pricing_tenant_feature_overrides_tenant_id
  ON pricing_tenant_feature_overrides(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pricing_tenant_feature_overrides_feature_id
  ON pricing_tenant_feature_overrides(feature_id);

DROP TRIGGER IF EXISTS pricing_tenant_feature_overrides_set_updated_at
  ON pricing_tenant_feature_overrides;
CREATE TRIGGER pricing_tenant_feature_overrides_set_updated_at
  BEFORE UPDATE ON pricing_tenant_feature_overrides
  FOR EACH ROW
  EXECUTE FUNCTION pricing_set_updated_at();


CREATE TABLE IF NOT EXISTS pricing_tenant_limit_overrides (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  limit_id        BIGINT NOT NULL REFERENCES pricing_limits_catalog(id) ON DELETE RESTRICT,
  limit_value     VARCHAR(255) NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_tenant_limit_overrides_unique UNIQUE (tenant_id, limit_id)
);

CREATE INDEX IF NOT EXISTS idx_pricing_tenant_limit_overrides_tenant_id
  ON pricing_tenant_limit_overrides(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pricing_tenant_limit_overrides_limit_id
  ON pricing_tenant_limit_overrides(limit_id);

DROP TRIGGER IF EXISTS pricing_tenant_limit_overrides_set_updated_at
  ON pricing_tenant_limit_overrides;
CREATE TRIGGER pricing_tenant_limit_overrides_set_updated_at
  BEFORE UPDATE ON pricing_tenant_limit_overrides
  FOR EACH ROW
  EXECUTE FUNCTION pricing_set_updated_at();
