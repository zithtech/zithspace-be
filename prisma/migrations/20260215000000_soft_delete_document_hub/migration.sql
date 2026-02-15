-- Migration: Add Soft Delete columns to DocumentHub, Document, and DocumentTree
-- Date: 2026-02-15
-- Description: Adds is_deleted, deleted_at, and deleted_by_id columns for soft delete support

-- ============================================
-- 1. DocumentHub (table: document_hub)
-- ============================================
ALTER TABLE "document_hub"
  ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "document_hub"
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

ALTER TABLE "document_hub"
  ADD COLUMN IF NOT EXISTS "deleted_by_id" TEXT;

-- Add foreign key for deleted_by_id -> User(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'document_hub_deleted_by_id_fkey'
      AND table_name = 'document_hub'
  ) THEN
    ALTER TABLE "document_hub"
      ADD CONSTRAINT "document_hub_deleted_by_id_fkey"
      FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Add index on is_deleted
CREATE INDEX IF NOT EXISTS "document_hub_is_deleted_idx" ON "document_hub"("is_deleted");

-- ============================================
-- 2. Document (table: documents)
-- ============================================
ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "deleted_by_id" TEXT;

-- Add foreign key for deleted_by_id -> User(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'documents_deleted_by_id_fkey'
      AND table_name = 'documents'
  ) THEN
    ALTER TABLE "documents"
      ADD CONSTRAINT "documents_deleted_by_id_fkey"
      FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Add index on is_deleted
CREATE INDEX IF NOT EXISTS "documents_is_deleted_idx" ON "documents"("is_deleted");

-- ============================================
-- 3. DocumentTree (table: documenttree)
-- ============================================
ALTER TABLE "documenttree"
  ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "documenttree"
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

ALTER TABLE "documenttree"
  ADD COLUMN IF NOT EXISTS "deleted_by_id" TEXT;

-- Add foreign key for deleted_by_id -> User(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'documenttree_deleted_by_id_fkey'
      AND table_name = 'documenttree'
  ) THEN
    ALTER TABLE "documenttree"
      ADD CONSTRAINT "documenttree_deleted_by_id_fkey"
      FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
