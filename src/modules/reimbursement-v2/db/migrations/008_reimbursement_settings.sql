-- Migration: 008_reimbursement_settings.sql
-- Adds mail routing configuration table for the Reimbursement 2.0 module.
-- Mirrors lv2_leave_settings from the Leave V2 module.

CREATE TABLE IF NOT EXISTS rb2_reimbursement_settings (
  tenant_id   TEXT        NOT NULL PRIMARY KEY,
  mail_config JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE rb2_reimbursement_settings IS
  'Per-tenant mail routing configuration for the Reimbursement V2 module.
   mail_config stores: replyToMode, reportsToEnabled, officeCcEnabled,
   additionalToEmails, customToEmails, additionalCcEmails, customCcEmails.';
