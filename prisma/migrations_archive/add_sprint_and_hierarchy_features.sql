-- Migration: Add Sprint Management and Issue Hierarchy Features
-- Date: 2025-12-31

-- ============================================
-- PART 1: Add Sprint Management Fields to release_plans
-- ============================================

-- Add sprint management fields
ALTER TABLE release_plans 
ADD COLUMN IF NOT EXISTS goal TEXT,
ADD COLUMN IF NOT EXISTS started_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS committed_points INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS completed_points INTEGER DEFAULT 0;

-- Update existing records to set default values
UPDATE release_plans 
SET committed_points = 0, 
    completed_points = 0 
WHERE committed_points IS NULL OR completed_points IS NULL;

-- Add index for efficient sprint queries
CREATE INDEX IF NOT EXISTS idx_release_plans_project_type_status 
ON release_plans(project_id, type, status);

-- ============================================
-- PART 2: Add Issue Hierarchy Fields to tickets
-- ============================================

-- Add hierarchy fields
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS epic_id UUID,
ADD COLUMN IF NOT EXISTS parent_id UUID,
ADD COLUMN IF NOT EXISTS rank TEXT;

-- Add foreign key constraints for hierarchy
ALTER TABLE tickets
ADD CONSTRAINT fk_tickets_epic
FOREIGN KEY (epic_id) 
REFERENCES tickets(id) 
ON DELETE SET NULL;

ALTER TABLE tickets
ADD CONSTRAINT fk_tickets_parent
FOREIGN KEY (parent_id) 
REFERENCES tickets(id) 
ON DELETE SET NULL;

-- Add indexes for hierarchy queries
CREATE INDEX IF NOT EXISTS idx_tickets_epic_id ON tickets(epic_id);
CREATE INDEX IF NOT EXISTS idx_tickets_parent_id ON tickets(parent_id);
CREATE INDEX IF NOT EXISTS idx_tickets_project_release ON tickets(project_id, release_plan_id);

-- ============================================
-- PART 3: Data Migration Notes
-- ============================================

-- Note: Ticket type field already exists and accepts any string value
-- Existing values: "Task", "Bug", "Feat", "Overwrite"
-- New values to be used: "Epic", "Story", "Sub-task"
-- No migration needed - just start using new values in application

-- Note: ReleasePlan status field already exists
-- Existing values: "planned", "active", "completed", "cancelled", "on_hold"
-- Sprint lifecycle will use: "planning" (map to "planned"), "active", "completed"

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify release_plans columns
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'release_plans' 
-- AND column_name IN ('goal', 'started_at', 'completed_at', 'committed_points', 'completed_points');

-- Verify tickets columns
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'tickets' 
-- AND column_name IN ('epic_id', 'parent_id', 'rank');

-- Verify indexes
-- SELECT indexname, indexdef 
-- FROM pg_indexes 
-- WHERE tablename IN ('release_plans', 'tickets') 
-- AND indexname LIKE 'idx_%';
