-- ============================================================================
-- Leave 2.0 — global holiday catalog (migration 009)
--
-- A GLOBAL (not tenant-scoped) reference list of country holidays. The
-- "Government Holidays" page lets a tenant browse this catalog by country,
-- pick holidays, and add copies into their own lv2_holidays.
--
-- Seeded from the existing fixed_holidays (the India set) as the IN catalog,
-- deduped by (name, date).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS lv2_holiday_catalog (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country    text NOT NULL,
  name       text NOT NULL,
  states     text[] NOT NULL DEFAULT '{}',
  districts  text[] NOT NULL DEFAULT '{}',
  from_date  date NOT NULL,
  to_date    date NOT NULL,
  type       text NOT NULL DEFAULT 'National',
  rule       text NOT NULL DEFAULT 'Fixed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_lv2_holiday_catalog_country
  ON lv2_holiday_catalog (country, from_date);

-- Seed the India catalog from fixed_holidays (distinct by name + date).
INSERT INTO lv2_holiday_catalog (country, name, states, from_date, to_date, type, rule)
SELECT DISTINCT ON (fh.holiday_name, fh.from_date::date)
       COALESCE(fh.country, 'IN'),
       fh.holiday_name,
       COALESCE(fh.state, '{}'),
       fh.from_date::date,
       fh.to_date::date,
       COALESCE(fh.type, 'National'),
       COALESCE(fh.rule, 'Fixed')
  FROM fixed_holidays fh
 WHERE NOT EXISTS (SELECT 1 FROM lv2_holiday_catalog)
 ORDER BY fh.holiday_name, fh.from_date::date;
