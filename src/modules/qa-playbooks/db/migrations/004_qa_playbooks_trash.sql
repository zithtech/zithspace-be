-- Migration 004: Soft delete / trash for QA Playbooks
--
-- Adds deleted_at and deleted_by columns to qa_playbooks to support moving
-- playbooks to Trash, viewing trash, restoring them, and permanently deleting them.

ALTER TABLE qa_playbooks
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

CREATE INDEX IF NOT EXISTS qa_playbooks_deleted_at_idx ON qa_playbooks (deleted_at);
