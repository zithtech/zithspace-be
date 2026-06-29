// src/modules/performance-report/db/schema.ts
//
// Idempotent schema bootstrap for the Performance Report module's own tables.
// Like the leave-v2 / onboarding raw-SQL modules, these tables are managed here
// (NOT in schema.prisma) and created at app boot via `CREATE TABLE IF NOT
// EXISTS`. Run from startServer() in src/app.ts.
//
// Tenant isolation = two independent layers:
//   1. RLS policies (FORCE'd, so even the table owner is bound by them).
//   2. Explicit `tenant_id = $1` filters in every repository query.
// The app sets `app.current_tenant_id` per transaction via withTenant().

import { perfReportPool } from './pool';

export async function ensurePerformanceReportSchema(): Promise<void> {
  await perfReportPool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`); // gen_random_uuid()

  // ── prr_settings — one row per tenant ───────────────────────────────────────
  // Top-level auto-generation config the monthly cron will read. The cron itself
  // is NOT built yet (settings page first); this is the seam it will read from.
  await perfReportPool.query(`
    CREATE TABLE IF NOT EXISTS prr_settings (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id             uuid NOT NULL,
      auto_generate_enabled boolean NOT NULL DEFAULT true,
      -- When in the month to run. 'last_day' = final calendar day at generation_time.
      generation_day        text NOT NULL DEFAULT 'last_day'
                              CHECK (generation_day IN ('last_day')),
      -- HH:mm (24h) the cron fires on generation_day. Spec default 23:59.
      generation_time       text NOT NULL DEFAULT '23:59',
      created_by            uuid,
      updated_by            uuid,
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now()
    );
  `);
  await perfReportPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_prr_settings_tenant
      ON prr_settings (tenant_id);
  `);

  // ── prr_module_settings — one row per scoring module per tenant ─────────────
  // The 5 core modules: attendance, leaves, time_tracking, daily_updates,
  // tickets. Each carries an enabled flag, a weight (enabled weights sum to 100),
  // and a free-form `config` jsonb for future module-specific sub-rules.
  await perfReportPool.query(`
    CREATE TABLE IF NOT EXISTS prr_module_settings (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   uuid NOT NULL,
      module_key  text NOT NULL
                    CHECK (module_key IN
                      ('attendance', 'leaves', 'time_tracking', 'daily_updates', 'tickets')),
      is_enabled  boolean NOT NULL DEFAULT true,
      weight      numeric(5, 2) NOT NULL DEFAULT 20
                    CHECK (weight >= 0 AND weight <= 100),
      config      jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by  uuid,
      updated_by  uuid,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    );
  `);
  await perfReportPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_prr_module_settings_tenant_module
      ON prr_module_settings (tenant_id, module_key);
  `);

  // ── prr_generated_reports — one frozen monthly report per user ──────────────
  // The PDF lives on R2 (file_url); only the scores + a small summary live here,
  // so the archive is immutable (deleted tickets still show in the stored PDF)
  // without duplicating every stage's rows.
  await perfReportPool.query(`
    CREATE TABLE IF NOT EXISTS prr_generated_reports (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id             uuid NOT NULL,
      user_id               text NOT NULL,
      period_key            text NOT NULL,
      period_start          date NOT NULL,
      period_end            date NOT NULL,
      overall_score         numeric(5, 2),
      tickets_score         numeric(5, 2),
      time_tracking_score   numeric(5, 2),
      daily_updates_score   numeric(5, 2),
      attendance_score      numeric(5, 2),
      leaves_score          numeric(5, 2),
      summary               jsonb NOT NULL DEFAULT '{}'::jsonb,
      file_url              text NOT NULL,
      file_key              text,
      status                text NOT NULL DEFAULT 'generated',
      generated_by          text,
      generated_at          timestamptz NOT NULL DEFAULT now()
    );
  `);
  await perfReportPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_prr_generated_tenant_user_period
      ON prr_generated_reports (tenant_id, user_id, period_key);
  `);
  await perfReportPool.query(`
    CREATE INDEX IF NOT EXISTS ix_prr_generated_tenant_period
      ON prr_generated_reports (tenant_id, period_key);
  `);

  // ── Row-Level Security (defense in depth; explicit tenant_id is primary) ─────
  await perfReportPool.query(`
    DO $$
    DECLARE
      t text;
    BEGIN
      FOREACH t IN ARRAY ARRAY['prr_settings', 'prr_module_settings', 'prr_generated_reports']
      LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
        EXECUTE format($f$
          CREATE POLICY tenant_isolation ON %I
            USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
            WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        $f$, t);
      END LOOP;
    END $$;
  `);

  console.log('✅ Performance Report tables ensured (settings, module_settings)');
}
