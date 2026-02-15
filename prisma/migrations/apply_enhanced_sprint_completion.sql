-- Migration: Enhanced Sprint Completion System - Complete Package
-- Description: Applies all migrations for Bucket, Trash, and Sprint Completion Log systems
-- Created: 2026-01-18
-- Order: Run this after existing schema is in place

-- =====================================================
-- PART 1: BUCKET SYSTEM
-- =====================================================

-- Create buckets table
CREATE TABLE IF NOT EXISTS buckets (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  project_id VARCHAR(255) NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  color VARCHAR(50) DEFAULT '#6366f1',
  is_shared BOOLEAN DEFAULT FALSE,
  created_by_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_buckets_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_buckets_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_buckets_creator FOREIGN KEY (created_by_id) REFERENCES users(id),
  CONSTRAINT unique_bucket_per_project UNIQUE (tenant_id, project_id, name)
);

-- Create bucket_members table
CREATE TABLE IF NOT EXISTS bucket_members (
  id VARCHAR(255) PRIMARY KEY,
  bucket_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'member',
  added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_bucket_members_bucket FOREIGN KEY (bucket_id) REFERENCES buckets(id) ON DELETE CASCADE,
  CONSTRAINT fk_bucket_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT unique_bucket_member UNIQUE (bucket_id, user_id)
);

-- Add bucket_id to tickets
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS bucket_id VARCHAR(255) NULL,
ADD CONSTRAINT fk_tickets_bucket FOREIGN KEY (bucket_id) REFERENCES buckets(id) ON DELETE SET NULL;

-- Bucket indexes
CREATE INDEX IF NOT EXISTS idx_buckets_tenant_id ON buckets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_buckets_project_id ON buckets(project_id);
CREATE INDEX IF NOT EXISTS idx_buckets_created_by_id ON buckets(created_by_id);
CREATE INDEX IF NOT EXISTS idx_bucket_members_bucket_id ON bucket_members(bucket_id);
CREATE INDEX IF NOT EXISTS idx_bucket_members_user_id ON bucket_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_bucket_id ON tickets(bucket_id);

-- =====================================================
-- PART 2: TRASH/SOFT DELETE SYSTEM
-- =====================================================

-- Add soft delete columns
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS deleted_by_id VARCHAR(255) NULL,
ADD CONSTRAINT fk_tickets_deleted_by FOREIGN KEY (deleted_by_id) REFERENCES users(id);

-- Trash indexes
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_is_deleted ON tickets(tenant_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_tickets_project_is_deleted ON tickets(project_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_tickets_is_deleted_deleted_at ON tickets(is_deleted, deleted_at);

-- Partial indexes for trash queries
CREATE INDEX IF NOT EXISTS idx_tickets_trash_lookup 
ON tickets(tenant_id, deleted_at DESC) 
WHERE is_deleted = TRUE;

CREATE INDEX IF NOT EXISTS idx_tickets_auto_purge 
ON tickets(deleted_at) 
WHERE is_deleted = TRUE AND deleted_at IS NOT NULL;

-- =====================================================
-- PART 3: SPRINT COMPLETION LOG
-- =====================================================

-- Create sprint_completion_logs table
CREATE TABLE IF NOT EXISTS sprint_completion_logs (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  sprint_plan_id VARCHAR(255) NOT NULL,
  project_id VARCHAR(255) NOT NULL,
  ticket_id VARCHAR(255) NOT NULL,
  action VARCHAR(100) NOT NULL,
  destination_id VARCHAR(255) NULL,
  destination_type VARCHAR(50) NULL,
  performed_by_id VARCHAR(255) NOT NULL,
  performed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  
  CONSTRAINT fk_sprint_completion_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_sprint_completion_logs_sprint FOREIGN KEY (sprint_plan_id) REFERENCES release_plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_sprint_completion_logs_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_sprint_completion_logs_user FOREIGN KEY (performed_by_id) REFERENCES users(id)
);

-- Sprint completion log indexes
CREATE INDEX IF NOT EXISTS idx_sprint_completion_logs_sprint_plan_id ON sprint_completion_logs(sprint_plan_id);
CREATE INDEX IF NOT EXISTS idx_sprint_completion_logs_project_id ON sprint_completion_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_sprint_completion_logs_ticket_id ON sprint_completion_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_sprint_completion_logs_tenant_id ON sprint_completion_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sprint_completion_logs_performed_at ON sprint_completion_logs(performed_at);
CREATE INDEX IF NOT EXISTS idx_sprint_completion_logs_tenant_date ON sprint_completion_logs(tenant_id, sprint_plan_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sprint_completion_logs_action ON sprint_completion_logs(action, performed_at DESC);

-- =====================================================
-- COMMENTS & DOCUMENTATION
-- =====================================================

COMMENT ON TABLE buckets IS 'Bucket system for organizing tickets across projects';
COMMENT ON TABLE bucket_members IS 'Members with access to collaborative buckets';
COMMENT ON COLUMN tickets.is_deleted IS 'Soft delete flag - TRUE if ticket is in trash';
COMMENT ON COLUMN tickets.deleted_at IS 'Timestamp when ticket was moved to trash (7-day auto-purge)';
COMMENT ON TABLE sprint_completion_logs IS 'Audit trail for ticket dispositions during sprint completion';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Next steps:
-- 1. Run: npx prisma db push (or prisma migrate dev)
-- 2. Update existing ticket queries to exclude is_deleted = TRUE
-- 3. Set up cron job for trash auto-purge
-- 4. Deploy backend controllers for bucket, trash, and sprint completion
