-- Migration: Add Trash/Soft Delete System for Tickets
-- Description: Adds soft delete functionality with 7-day retention before permanent deletion
-- Created: 2026-01-18

-- Add soft delete columns to tickets table
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS deleted_by_id VARCHAR(255) NULL,
ADD CONSTRAINT fk_tickets_deleted_by FOREIGN KEY (deleted_by_id) REFERENCES users(id);

-- Create indexes for trash queries and auto-purge performance
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_is_deleted ON tickets(tenant_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_tickets_project_is_deleted ON tickets(project_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_tickets_is_deleted_deleted_at ON tickets(is_deleted, deleted_at);

-- Create partial index for efficient trash queries (only deleted tickets)
CREATE INDEX IF NOT EXISTS idx_tickets_trash_lookup 
ON tickets(tenant_id, deleted_at DESC) 
WHERE is_deleted = TRUE;

-- Create index for auto-purge job (tickets older than 7 days)
CREATE INDEX IF NOT EXISTS idx_tickets_auto_purge 
ON tickets(deleted_at) 
WHERE is_deleted = TRUE AND deleted_at IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN tickets.is_deleted IS 'Soft delete flag - TRUE if ticket is in trash';
COMMENT ON COLUMN tickets.deleted_at IS 'Timestamp when ticket was moved to trash (used for 7-day auto-purge)';
COMMENT ON COLUMN tickets.deleted_by_id IS 'User who moved the ticket to trash';

-- Note: Existing queries should be updated to filter out deleted tickets by default
-- WHERE is_deleted = FALSE OR is_deleted IS NULL
