-- ============================================================================
-- Leave 2.0 — Mail configuration settings (migration 011)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lv2_leave_settings (
  tenant_id     uuid PRIMARY KEY,
  mail_config   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
BEGIN
  EXECUTE format('ALTER TABLE lv2_leave_settings ENABLE ROW LEVEL SECURITY');
  EXECUTE format('ALTER TABLE lv2_leave_settings FORCE ROW LEVEL SECURITY');
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON lv2_leave_settings');
  EXECUTE format($f$
    CREATE POLICY tenant_isolation ON lv2_leave_settings
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  $f$);
END $$;
