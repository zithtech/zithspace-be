-- Migration: Add Bucket System for Ticket Organization
-- Description: Creates buckets and bucket_members tables for cross-project ticket organization
-- Created: 2026-01-18

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

-- Create bucket_members table for collaborative buckets
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

-- Add bucket_id column to tickets table
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS bucket_id VARCHAR(255) NULL,
ADD CONSTRAINT fk_tickets_bucket FOREIGN KEY (bucket_id) REFERENCES buckets(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_buckets_tenant_id ON buckets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_buckets_project_id ON buckets(project_id);
CREATE INDEX IF NOT EXISTS idx_buckets_created_by_id ON buckets(created_by_id);
CREATE INDEX IF NOT EXISTS idx_bucket_members_bucket_id ON bucket_members(bucket_id);
CREATE INDEX IF NOT EXISTS idx_bucket_members_user_id ON bucket_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_bucket_id ON tickets(bucket_id);

-- Add comments for documentation
COMMENT ON TABLE buckets IS 'Bucket system for organizing tickets across projects';
COMMENT ON TABLE bucket_members IS 'Members with access to collaborative buckets';
COMMENT ON COLUMN buckets.is_shared IS 'Indicates if bucket allows collaborative access via bucket_members';
COMMENT ON COLUMN buckets.project_id IS 'NULL for cross-project buckets, specific project_id for project-scoped buckets';
