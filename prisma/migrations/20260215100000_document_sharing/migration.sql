-- Migration: Add Document Sharing columns
-- Date: 2026-02-15
-- Description: Adds visibility, share_token, shared_by_id, and shared_at to documents table

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'private';

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "share_token" TEXT;

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "shared_by_id" TEXT;

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "shared_at" TIMESTAMP(3);

-- Add unique index on share_token
CREATE UNIQUE INDEX IF NOT EXISTS "documents_share_token_key" ON "documents"("share_token");

-- Add index on visibility
CREATE INDEX IF NOT EXISTS "documents_visibility_idx" ON "documents"("visibility");

-- Add index on share_token for lookups
CREATE INDEX IF NOT EXISTS "documents_share_token_idx" ON "documents"("share_token");

-- Add foreign key for shared_by_id -> users(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'documents_shared_by_id_fkey'
      AND table_name = 'documents'
  ) THEN
    ALTER TABLE "documents"
      ADD CONSTRAINT "documents_shared_by_id_fkey"
      FOREIGN KEY ("shared_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
