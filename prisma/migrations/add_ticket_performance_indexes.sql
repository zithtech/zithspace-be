-- Performance Optimization: Add indexes for ticket queries
-- Date: 2025-12-07
-- Purpose: Improve getTickets endpoint performance (reduce from 2s to ~300-500ms)
-- Updated: Using actual database column names (snake_case) from Prisma schema

-- Add composite indexes for commonly filtered columns with tenant_id
-- These indexes support the WHERE clauses in the getTickets query

-- Index for filtering by status (most common filter)
CREATE INDEX IF NOT EXISTS idx_ticket_tenant_status 
ON tickets (tenant_id, status);

-- Index for filtering by priority
CREATE INDEX IF NOT EXISTS idx_ticket_tenant_priority 
ON tickets (tenant_id, priority);

-- Index for filtering by project
CREATE INDEX IF NOT EXISTS idx_ticket_tenant_project 
ON tickets (tenant_id, project_id);

-- Index for filtering by assignee (supports both single and multiple assignee queries)
CREATE INDEX IF NOT EXISTS idx_ticket_tenant_assignee 
ON tickets (tenant_id, assignee_id);

-- Index for filtering by creator
CREATE INDEX IF NOT EXISTS idx_ticket_tenant_creator 
ON tickets (tenant_id, created_by_id);

-- Index for sorting by created_at (default sort field)
-- DESC order for better performance with default descending sort
CREATE INDEX IF NOT EXISTS idx_ticket_tenant_created 
ON tickets (tenant_id, created_at DESC);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_ticket_tenant_daterange 
ON tickets (tenant_id, created_at);

-- Composite index for common filter combinations (status + priority)
CREATE INDEX IF NOT EXISTS idx_ticket_tenant_status_priority 
ON tickets (tenant_id, status, priority);

-- Index for ticket number search (used in search queries)
CREATE INDEX IF NOT EXISTS idx_ticket_number 
ON tickets (ticket_number);

-- Index for title search (case-insensitive text search)
-- Note: PostgreSQL GIN index for better full-text search performance
-- Uncomment if you have many tickets and text search is slow:
-- CREATE INDEX IF NOT EXISTS idx_ticket_title_gin 
-- ON tickets USING gin(to_tsvector('english', title));

-- Add comments for documentation
COMMENT ON INDEX idx_ticket_tenant_status IS 'Optimize ticket queries filtered by status';
COMMENT ON INDEX idx_ticket_tenant_priority IS 'Optimize ticket queries filtered by priority';
COMMENT ON INDEX idx_ticket_tenant_project IS 'Optimize ticket queries filtered by project';
COMMENT ON INDEX idx_ticket_tenant_assignee IS 'Optimize ticket queries filtered by assignee';
COMMENT ON INDEX idx_ticket_tenant_creator IS 'Optimize ticket queries filtered by creator';
COMMENT ON INDEX idx_ticket_tenant_created IS 'Optimize ticket queries sorted by creation date (DESC)';
COMMENT ON INDEX idx_ticket_tenant_daterange IS 'Optimize ticket queries with date range filters';
COMMENT ON INDEX idx_ticket_tenant_status_priority IS 'Optimize ticket queries with combined status and priority filters';
COMMENT ON INDEX idx_ticket_number IS 'Optimize ticket number searches';

-- Verify indexes were created
-- Run this query to check:
-- SELECT indexname, tablename, indexdef 
-- FROM pg_indexes 
-- WHERE tablename = 'tickets' 
--   AND indexname LIKE 'idx_ticket%'
-- ORDER BY indexname;
