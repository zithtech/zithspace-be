-- Migration: Add soft-delete support to transactions
-- This script adds a deleted_at column and updates existing records.

-- 1. Add deleted_at column
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at ON transactions(deleted_at);

-- 3. Update existing records to have NULL deleted_at (if not already set)
UPDATE transactions SET deleted_at = NULL WHERE deleted_at IS NULL;
