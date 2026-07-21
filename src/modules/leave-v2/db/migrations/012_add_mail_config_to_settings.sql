-- ============================================================================
-- Leave 2.0 — Add mail_config to lv2_leave_settings (migration 012)
-- ============================================================================

ALTER TABLE lv2_leave_settings 
ADD COLUMN IF NOT EXISTS mail_config jsonb NOT NULL DEFAULT '{}'::jsonb;
