-- Add archive fields to tickets table for sprint completion handling
-- This allows completed tickets to be marked as archived when a sprint completes
-- while keeping them associated with the sprint for historical records

-- Add isArchived column (default false for all existing tickets)
ALTER TABLE "tickets" 
ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false;

-- Add archivedAt timestamp
ALTER TABLE "tickets" 
ADD COLUMN "archived_at" TIMESTAMP(3);

-- Add archivedById to track who archived the ticket
ALTER TABLE "tickets" 
ADD COLUMN "archived_by_id" VARCHAR(255);

-- Create indexes for efficient querying
-- Index for filtering archived vs non-archived tickets
CREATE INDEX "idx_tickets_archived" ON "tickets"("is_archived");

-- Composite index for common query patterns (project + archived status)
CREATE INDEX "idx_tickets_project_archived" ON "tickets"("project_id", "is_archived");

-- Composite index for status + archived filtering
CREATE INDEX "idx_tickets_status_archived" ON "tickets"("status", "is_archived");

-- Composite index for tenant + archived filtering
CREATE INDEX "idx_tickets_tenant_archived" ON "tickets"("tenant_id", "is_archived");

-- Add foreign key constraint for archivedById
ALTER TABLE "tickets" 
ADD CONSTRAINT "tickets_archived_by_id_fkey" 
FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add comment for documentation
COMMENT ON COLUMN "tickets"."is_archived" IS 'Marks tickets that were completed in a sprint and archived for historical record. Archived tickets are hidden from active views but accessible via archive views and sprint history.';
COMMENT ON COLUMN "tickets"."archived_at" IS 'Timestamp when the ticket was archived (typically when sprint was completed)';
COMMENT ON COLUMN "tickets"."archived_by_id" IS 'User ID who archived the ticket (typically user who completed the sprint)';
