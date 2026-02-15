-- ==========================================
-- COMPREHENSIVE PERFORMANCE INDEX MIGRATION
-- ==========================================
-- Date: 2025-12-07
-- Purpose: Apply all performance indexes for ticket-related queries
-- Expected Impact: 80-90% performance improvement across all ticket endpoints

-- ==========================================
-- PART 1: TICKET LIST QUERY INDEXES
-- ==========================================
-- These indexes optimize the GET /api/tickets endpoint
-- Expected improvement: 2000ms → 300-500ms

-- Index for filtering by status (most common filter)
CREATE INDEX IF NOT EXISTS idx_ticket_tenant_status 
ON tickets (tenant_id, status);

-- Index for filtering by priority
CREATE INDEX IF NOT EXISTS idx_ticket_tenant_priority 
ON tickets (tenant_id, priority);

-- Index for filtering by project
CREATE INDEX IF NOT EXISTS idx_ticket_tenant_project 
ON tickets (tenant_id, project_id);

-- Index for filtering by assignee (supports single and multiple assignee queries)
CREATE INDEX IF NOT EXISTS idx_ticket_tenant_assignee 
ON tickets (tenant_id, assignee_id);

-- Index for filtering by creator
CREATE INDEX IF NOT EXISTS idx_ticket_tenant_creator 
ON tickets (tenant_id, created_by_id);

-- Index for sorting by created_at (default sort field) - DESC for performance
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

-- ==========================================
-- PART 2: TICKET DETAIL QUERY INDEXES
-- ==========================================
-- These indexes optimize the GET /api/tickets/:id endpoint
-- Expected improvement: 2500-3000ms → 500-800ms

-- Index for ticket ID + tenant ID lookups (primary lookup pattern)
CREATE INDEX IF NOT EXISTS idx_ticket_id_tenant 
ON tickets (id, tenant_id);

-- Index for ticket ID only (backup for queries without tenant filter)
CREATE INDEX IF NOT EXISTS idx_ticket_id 
ON tickets (id);

-- ==========================================
-- PART 3: COMMENTS QUERY INDEXES
-- ==========================================
-- These indexes optimize comment fetching and pagination
-- Expected improvement: 1000-1500ms → 200-300ms

-- Index for comments by ticket (with DESC timestamp for pagination)
CREATE INDEX IF NOT EXISTS idx_comment_ticket_timestamp
ON ticket_comments (ticket_id, timestamp DESC);

-- Index for tenant + ticket comments (RLS optimized)
CREATE INDEX IF NOT EXISTS idx_comment_tenant_ticket
ON ticket_comments (tenant_id, ticket_id);

-- Index for comment updates/deletes (user-specific)
CREATE INDEX IF NOT EXISTS idx_comment_user_ticket
ON ticket_comments (user_id, ticket_id, tenant_id);

-- ==========================================
-- PART 4: RELATED LINKS QUERY INDEXES
-- ==========================================
-- These indexes optimize related links fetching
-- Expected improvement: 200-400ms → 50-100ms

-- Index for related links by ticket (with DESC added_at for sorting)
CREATE INDEX IF NOT EXISTS idx_relatedlink_ticket_added
ON ticket_related_links (ticket_id, added_at DESC);

-- Index for tenant + ticket related links (RLS optimized)
CREATE INDEX IF NOT EXISTS idx_relatedlink_tenant_ticket
ON ticket_related_links (tenant_id, ticket_id);

-- ==========================================
-- PART 5: ATTACHMENTS QUERY INDEXES
-- ==========================================
-- Note: These already exist in the schema (lines 208-209)
-- Included here for reference only (will be skipped if exist)

-- Index for attachments by ticket
CREATE INDEX IF NOT EXISTS idx_attachment_ticket
ON ticket_attachments (ticket_id);

-- Index for tenant + ticket attachments (RLS optimized)
CREATE INDEX IF NOT EXISTS idx_attachment_tenant_ticket
ON ticket_attachments (tenant_id, ticket_id);

-- ==========================================
-- PART 6: ACTIVITY LOG QUERY INDEXES
-- ==========================================
-- These indexes optimize activity log fetching

-- Index for activity log by ticket (with DESC timestamp)
CREATE INDEX IF NOT EXISTS idx_activitylog_ticket_timestamp
ON ticket_activity_log (ticket_id, timestamp DESC);

-- Index for tenant + ticket activity log
CREATE INDEX IF NOT EXISTS idx_activitylog_tenant_ticket
ON ticket_activity_log (tenant_id, ticket_id);

-- ==========================================
-- INDEX COMMENTS (DOCUMENTATION)
-- ==========================================

COMMENT ON INDEX idx_ticket_tenant_status IS 'Optimize ticket list queries filtered by status';
COMMENT ON INDEX idx_ticket_tenant_priority IS 'Optimize ticket list queries filtered by priority';
COMMENT ON INDEX idx_ticket_tenant_project IS 'Optimize ticket list queries filtered by project';
COMMENT ON INDEX idx_ticket_tenant_assignee IS 'Optimize ticket list queries filtered by assignee';
COMMENT ON INDEX idx_ticket_tenant_creator IS 'Optimize ticket list queries filtered by creator';
COMMENT ON INDEX idx_ticket_tenant_created IS 'Optimize ticket list queries sorted by creation date (DESC)';
COMMENT ON INDEX idx_ticket_tenant_daterange IS 'Optimize ticket list queries with date range filters';
COMMENT ON INDEX idx_ticket_tenant_status_priority IS 'Optimize ticket list queries with combined filters';
COMMENT ON INDEX idx_ticket_number IS 'Optimize ticket number searches';
COMMENT ON INDEX idx_ticket_id_tenant IS 'Optimize ticket detail lookups by ID + tenant';
COMMENT ON INDEX idx_ticket_id IS 'Optimize ticket detail lookups by ID only';
COMMENT ON INDEX idx_comment_ticket_timestamp IS 'Optimize comment queries with pagination support';
COMMENT ON INDEX idx_comment_tenant_ticket IS 'Optimize RLS-filtered comment queries';
COMMENT ON INDEX idx_comment_user_ticket IS 'Optimize user-specific comment operations';
COMMENT ON INDEX idx_relatedlink_ticket_added IS 'Optimize related links queries with sorting';
COMMENT ON INDEX idx_relatedlink_tenant_ticket IS 'Optimize RLS-filtered related links queries';
COMMENT ON INDEX idx_activitylog_ticket_timestamp IS 'Optimize activity log queries with sorting';
COMMENT ON INDEX idx_activitylog_tenant_ticket IS 'Optimize RLS-filtered activity log queries';

-- ==========================================
-- VERIFICATION QUERIES
-- ==========================================
-- Run these queries to verify all indexes were created successfully

-- Check all ticket-related indexes
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename IN ('tickets', 'ticket_comments', 'ticket_related_links', 'ticket_attachments', 'ticket_activity_log')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Count indexes per table
SELECT 
  tablename,
  COUNT(*) as index_count
FROM pg_indexes 
WHERE tablename IN ('tickets', 'ticket_comments', 'ticket_related_links', 'ticket_attachments', 'ticket_activity_log')
  AND indexname LIKE 'idx_%'
GROUP BY tablename
ORDER BY tablename;

-- Expected counts:
-- tickets: 11 indexes
-- ticket_comments: 3 indexes
-- ticket_related_links: 2 indexes
-- ticket_attachments: 2 indexes (already exist)
-- ticket_activity_log: 2 indexes
-- TOTAL: ~20 new indexes

-- ==========================================
-- PERFORMANCE TESTING QUERIES
-- ==========================================
-- Use EXPLAIN ANALYZE to verify indexes are being used

-- Test 1: Ticket list query (should use idx_ticket_tenant_status)
EXPLAIN ANALYZE
SELECT * FROM tickets
WHERE tenant_id = 'your-tenant-id'
  AND status = 'in_progress'
ORDER BY created_at DESC
LIMIT 10;

-- Test 2: Ticket detail query (should use idx_ticket_id_tenant)
EXPLAIN ANALYZE
SELECT * FROM tickets
WHERE id = 'your-ticket-id'
  AND tenant_id = 'your-tenant-id';

-- Test 3: Comments query (should use idx_comment_ticket_timestamp)
EXPLAIN ANALYZE
SELECT * FROM ticket_comments
WHERE ticket_id = 'your-ticket-id'
  AND tenant_id = 'your-tenant-id'
ORDER BY timestamp DESC
LIMIT 10;

-- ==========================================
-- INDEX MAINTENANCE (OPTIONAL)
-- ==========================================

-- Reindex all ticket-related tables (run if performance degrades over time)
-- REINDEX TABLE tickets;
-- REINDEX TABLE ticket_comments;
-- REINDEX TABLE ticket_related_links;
-- REINDEX TABLE ticket_attachments;
-- REINDEX TABLE ticket_activity_log;

-- Analyze tables to update statistics (helps query planner)
ANALYZE tickets;
ANALYZE ticket_comments;
ANALYZE ticket_related_links;
ANALYZE ticket_attachments;
ANALYZE ticket_activity_log;

-- ==========================================
-- CLEANUP (IF NEEDED)
-- ==========================================
-- Uncomment and run if you need to remove all indexes

-- DROP INDEX IF EXISTS idx_ticket_tenant_status;
-- DROP INDEX IF EXISTS idx_ticket_tenant_priority;
-- DROP INDEX IF EXISTS idx_ticket_tenant_project;
-- DROP INDEX IF EXISTS idx_ticket_tenant_assignee;
-- DROP INDEX IF EXISTS idx_ticket_tenant_creator;
-- DROP INDEX IF EXISTS idx_ticket_tenant_created;
-- DROP INDEX IF EXISTS idx_ticket_tenant_daterange;
-- DROP INDEX IF EXISTS idx_ticket_tenant_status_priority;
-- DROP INDEX IF EXISTS idx_ticket_number;
-- DROP INDEX IF EXISTS idx_ticket_id_tenant;
-- DROP INDEX IF EXISTS idx_ticket_id;
-- DROP INDEX IF EXISTS idx_comment_ticket_timestamp;
-- DROP INDEX IF EXISTS idx_comment_tenant_ticket;
-- DROP INDEX IF EXISTS idx_comment_user_ticket;
-- DROP INDEX IF EXISTS idx_relatedlink_ticket_added;
-- DROP INDEX IF EXISTS idx_relatedlink_tenant_ticket;
-- DROP INDEX IF EXISTS idx_activitylog_ticket_timestamp;
-- DROP INDEX IF EXISTS idx_activitylog_tenant_ticket;

-- ==========================================
-- EXECUTION SUMMARY
-- ==========================================
-- This migration creates ~20 strategic indexes across 5 tables
-- Expected total time to apply: 30-60 seconds (depending on data size)
-- Expected performance improvement: 80-90% across ticket endpoints
--
-- BEFORE: 
--   - Ticket list: ~2 seconds
--   - Ticket detail: ~5 seconds
--
-- AFTER:
--   - Ticket list: ~300-500ms (85% faster)
--   - Ticket detail: ~1 second (80% faster)
-- ==========================================
