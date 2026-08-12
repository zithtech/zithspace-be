// src/db/qaSubmissionSchema.ts
//
// Idempotent schema bootstrap for QA Submission / QA Sign-off / PM Approval.
//
// The QA workspace lives outside Prisma (raw SQL — see
// src/scripts/createTestCaseTables.ts), so these tables are managed here and
// created with `CREATE TABLE IF NOT EXISTS` on first use by the controller.
// src/scripts/createQaSubmissionTables.ts runs the same statements standalone.

import pool from "../config/dbpool";

/**
 * Statements are ordered: the qa_test_runs column first (submissions read it),
 * then the parent table, then children. Every statement is safe to re-run.
 */
export const QA_SUBMISSION_DDL: string[] = [
  // A run belongs to a scope so a submission can offer "the runs for this
  // scope". Nullable: runs created before this column stay usable and are
  // offered as unattributed evidence.
  `ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS scope_id UUID`,
  `CREATE INDEX IF NOT EXISTS qa_test_runs_scope_idx ON qa_test_runs (tenant_id, scope_id)`,

  `CREATE TABLE IF NOT EXISTS qa_submissions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     submission_name VARCHAR(255) NOT NULL,
     scope_id UUID NOT NULL REFERENCES qa_test_scopes(id) ON DELETE CASCADE,
     submission_type VARCHAR(60) DEFAULT 'Testing Completion',
     qa_owner_id UUID,
     reviewer_id UUID,
     description TEXT,
     qa_summary TEXT,
     qa_recommendation VARCHAR(40),
     recommendation_ack BOOLEAN DEFAULT FALSE,
     recommendation_ack_note TEXT,
     status VARCHAR(40) NOT NULL DEFAULT 'Draft',
     retesting_status VARCHAR(40) NOT NULL DEFAULT 'Not Started',
     version INT NOT NULL DEFAULT 1,
     submitted_at TIMESTAMPTZ,
     submitted_by UUID,
     signed_off_by UUID,
     signed_off_at TIMESTAMPTZ,
     signoff_comment TEXT,
     signoff_snapshot JSONB,
     approved_by UUID,
     approved_at TIMESTAMPTZ,
     approver_comment TEXT,
     sent_back_by UUID,
     sent_back_at TIMESTAMPTZ,
     sent_back_reason TEXT,
     sent_back_stage VARCHAR(20),
     created_by UUID,
     updated_by UUID,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS qa_submissions_tenant_scope_idx ON qa_submissions (tenant_id, scope_id)`,
  `CREATE INDEX IF NOT EXISTS qa_submissions_tenant_status_idx ON qa_submissions (tenant_id, status)`,

  // Testing evidence. run_role separates the original execution from the retest
  // runs added after developers ship fixes (§15).
  `CREATE TABLE IF NOT EXISTS qa_submission_runs (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     submission_id UUID NOT NULL REFERENCES qa_submissions(id) ON DELETE CASCADE,
     run_id UUID NOT NULL REFERENCES qa_test_runs(id) ON DELETE CASCADE,
     run_role VARCHAR(20) NOT NULL DEFAULT 'initial',
     added_by UUID,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     UNIQUE (submission_id, run_id)
   )`,
  `CREATE INDEX IF NOT EXISTS qa_submission_runs_run_idx ON qa_submission_runs (tenant_id, run_id)`,

  `CREATE TABLE IF NOT EXISTS qa_submission_known_issues (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     submission_id UUID NOT NULL REFERENCES qa_submissions(id) ON DELETE CASCADE,
     bug_id TEXT,
     bug_number VARCHAR(60),
     severity VARCHAR(60),
     current_status VARCHAR(60),
     business_impact TEXT,
     workaround TEXT,
     expected_resolution DATE,
     accepted_by VARCHAR(255),
     comment TEXT,
     position INT DEFAULT 0,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS qa_submission_known_issues_sub_idx ON qa_submission_known_issues (submission_id)`,

  `CREATE TABLE IF NOT EXISTS qa_submission_attachments (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     submission_id UUID NOT NULL REFERENCES qa_submissions(id) ON DELETE CASCADE,
     category VARCHAR(40) NOT NULL DEFAULT 'Other',
     kind VARCHAR(10) NOT NULL DEFAULT 'file',
     name VARCHAR(255) NOT NULL,
     url TEXT NOT NULL,
     file_type VARCHAR(120),
     file_size BIGINT,
     uploaded_by UUID,
     created_at TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS qa_submission_attachments_sub_idx ON qa_submission_attachments (submission_id)`,

  `CREATE TABLE IF NOT EXISTS qa_submission_history (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     submission_id UUID NOT NULL REFERENCES qa_submissions(id) ON DELETE CASCADE,
     event_type VARCHAR(60) NOT NULL,
     title VARCHAR(255) NOT NULL,
     detail TEXT,
     meta JSONB DEFAULT '{}'::jsonb,
     actor_id UUID,
     created_at TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS qa_submission_history_sub_idx ON qa_submission_history (submission_id, created_at DESC)`,

  // Every Submit freezes the numbers reported at that moment, so v1/v2/v3 stay
  // readable after later runs change the live totals (§29).
  `CREATE TABLE IF NOT EXISTS qa_submission_versions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     submission_id UUID NOT NULL REFERENCES qa_submissions(id) ON DELETE CASCADE,
     version INT NOT NULL,
     snapshot JSONB NOT NULL,
     note TEXT,
     created_by UUID,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     UNIQUE (submission_id, version)
   )`,

  // ── Compatibility ─────────────────────────────────────────────────────────
  // The approval stage was originally modelled as "PM Approval" and has since
  // been generalised to a named Approver. CREATE TABLE IF NOT EXISTS won't
  // reshape a table that already exists, so bring an earlier one forward.
  `ALTER TABLE qa_submissions ADD COLUMN IF NOT EXISTS approver_comment TEXT`,
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_name = 'qa_submissions' AND column_name = 'pm_comment'
     ) THEN
       UPDATE qa_submissions
          SET approver_comment = COALESCE(approver_comment, pm_comment)
        WHERE pm_comment IS NOT NULL;
       ALTER TABLE qa_submissions DROP COLUMN pm_comment;
     END IF;
   END $$`,
  `UPDATE qa_submissions SET status = 'Approved' WHERE status = 'PM Approved'`,
  `UPDATE qa_submissions SET sent_back_stage = 'approver' WHERE sent_back_stage = 'pm'`,
];

let schemaReady: Promise<void> | null = null;

/**
 * Runs the DDL once per process. The promise is cached rather than a boolean so
 * concurrent first requests wait on the same bootstrap instead of racing it.
 */
export function ensureQaSubmissionSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const statement of QA_SUBMISSION_DDL) {
        await pool.query(statement);
      }
    })().catch((err) => {
      // Let the next request retry rather than caching a permanent failure.
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}
