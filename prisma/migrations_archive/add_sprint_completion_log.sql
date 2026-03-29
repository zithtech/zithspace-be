-- Migration: Add Sprint Completion Log for Audit Trail
-- Description: Tracks ticket dispositions during sprint completion for compliance and analytics
-- Created: 2026-01-18

-- Create sprint_completion_logs table
CREATE TABLE IF NOT EXISTS sprint_completion_logs (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  sprint_plan_id VARCHAR(255) NOT NULL,
  project_id VARCHAR(255) NOT NULL,
  ticket_id VARCHAR(255) NOT NULL,
  action VARCHAR(100) NOT NULL, -- moved_to_sprint, moved_to_bucket, moved_to_backlog, moved_to_trash
  destination_id VARCHAR(255) NULL, -- Sprint ID, Bucket ID, or NULL for backlog/trash
  destination_type VARCHAR(50) NULL, -- sprint, bucket, backlog, trash
  performed_by_id VARCHAR(255) NOT NULL,
  performed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  
  CONSTRAINT fk_sprint_completion_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_sprint_completion_logs_sprint FOREIGN KEY (sprint_plan_id) REFERENCES release_plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_sprint_completion_logs_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_sprint_completion_logs_user FOREIGN KEY (performed_by_id) REFERENCES users(id)
);

-- Create indexes for efficient querying and analytics
CREATE INDEX IF NOT EXISTS idx_sprint_completion_logs_sprint_plan_id ON sprint_completion_logs(sprint_plan_id);
CREATE INDEX IF NOT EXISTS idx_sprint_completion_logs_project_id ON sprint_completion_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_sprint_completion_logs_ticket_id ON sprint_completion_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_sprint_completion_logs_tenant_id ON sprint_completion_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sprint_completion_logs_performed_at ON sprint_completion_logs(performed_at);

-- Composite index for common queries (sprint history by tenant and date)
CREATE INDEX IF NOT EXISTS idx_sprint_completion_logs_tenant_date 
ON sprint_completion_logs(tenant_id, sprint_plan_id, performed_at DESC);

-- Index for action-based analytics
CREATE INDEX IF NOT EXISTS idx_sprint_completion_logs_action 
ON sprint_completion_logs(action, performed_at DESC);

-- Add comments for documentation
COMMENT ON TABLE sprint_completion_logs IS 'Audit trail for ticket dispositions during sprint completion';
COMMENT ON COLUMN sprint_completion_logs.action IS 'Action taken: moved_to_sprint, moved_to_bucket, moved_to_backlog, moved_to_trash';
COMMENT ON COLUMN sprint_completion_logs.destination_id IS 'ID of destination entity (Sprint/Bucket) or NULL for backlog/trash';
COMMENT ON COLUMN sprint_completion_logs.destination_type IS 'Type of destination: sprint, bucket, backlog, trash';
COMMENT ON COLUMN sprint_completion_logs.metadata IS 'Additional context: previous state, notes, bulk operation ID, etc.';
