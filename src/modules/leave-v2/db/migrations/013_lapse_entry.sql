-- Migration: 013_lapse_entry.sql
-- Description: Add 'lapse' to lv2_leave_ledger entry_type check constraint.

DO $$
DECLARE
  c_name text;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'lv2_leave_ledger'::regclass
    AND (conname LIKE '%entry_type_check%' OR conname LIKE '%entry_type%');

  IF c_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE lv2_leave_ledger DROP CONSTRAINT ' || c_name;
  END IF;

  ALTER TABLE lv2_leave_ledger ADD CONSTRAINT lv2_leave_ledger_entry_type_check 
    CHECK (entry_type IN ('opening', 'accrual', 'debit', 'credit', 'adjustment', 'encashment', 'lapse'));
END $$;
