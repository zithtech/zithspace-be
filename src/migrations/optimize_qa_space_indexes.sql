-- Migration: optimize_qa_space_indexes.sql
-- Description: Indexes to eliminate sequential scans on QA Space Scope and Runs queries.
-- Note: Each statement should be executed with CONCURRENTLY outside transaction blocks in production.

-- 1. Index on qa_test_scopes for tenant and JSONB product lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qa_test_scopes_tenant_product 
  ON qa_test_scopes (tenant_id, LOWER(details->>'product'));

-- 2. Index on qa_test_scopes for owner filtering (My Scopes vs All Scopes)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qa_test_scopes_tenant_owner
  ON qa_test_scopes (tenant_id, LOWER(qa_owner));

-- 3. Composite index on qa_test_runs for tenant and chronological pagination
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qa_test_runs_tenant_created 
  ON qa_test_runs (tenant_id, created_at DESC);

-- 4. Foreign key index on qa_test_runs.scope_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qa_test_runs_scope_id 
  ON qa_test_runs (scope_id);

-- 5. Foreign key index on qa_test_runs.suite_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qa_test_runs_suite_id 
  ON qa_test_runs (suite_id);

-- 6. Composite index on qa_test_run_results for rapid status count aggregation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qa_test_run_results_run_status 
  ON qa_test_run_results (test_run_id, status);

-- 7. Index on qa_parent_test_cases for tenant and project lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qa_parent_test_cases_tenant_proj 
  ON qa_parent_test_cases (tenant_id, project_id);

-- 8. Index on qa_test_suites for parent test case relationship
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qa_test_suites_parent 
  ON qa_test_suites (parent_test_case_id);
