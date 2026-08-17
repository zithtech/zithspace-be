import { Request, Response } from 'express';
import pool from '../config/dbpool';
import { ensureQaSubmissionSchema } from '../db/qaSubmissionSchema';
import { getAIProviderForTenant } from '../services/ai/resolver';
import { uploadSubmissionAttachmentToR2, deleteFileFromR2 } from '../utils/r2Client';

/**
 * QA Submissions — the formal reporting layer that sits after Test Runs and the
 * Bug List:
 *
 *   Test Scope → Cases → Suites → Runs → Bugs → QA Submission → QA Sign-off → Approval
 *
 * Three ideas are deliberately kept apart (§22, §35):
 *   Submission   "QA finished this testing cycle; here are the current results."
 *                Valid with bugs still open.
 *   QA Sign-off  "Testing AND retesting are done; this is QA's recommendation."
 *   Approval     Business acceptance by the named approver (the submission's
 *                Reviewer), separate from QA's recommendation.
 *
 * All execution numbers are derived from the linked runs — nothing here accepts
 * a client-supplied pass/fail count (§33.3, §33.4).
 */

// ─── Vocabulary ──────────────────────────────────────────────────────────────

export const SUBMISSION_STATUSES = [
  'Draft',
  'Submitted',
  'Under Review',
  'Retesting',
  'Ready for QA Sign-off',
  'QA Signed-off',
  'Approved',
  'Sent Back',
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const SUBMISSION_TYPES = [
  'Testing Completion',
  'Regression Submission',
  'Retest Submission',
  'Release QA Submission',
  'Final QA Sign-off',
] as const;

export const RECOMMENDATIONS = [
  'Pass',
  'Pass with Known Issues',
  'Fail',
  'Blocked',
] as const;

export const RETESTING_STATUSES = [
  'Not Started',
  'Retesting In Progress',
  'Partially Retested',
  'Retesting Completed',
] as const;

/** Bug workflow states that still count as unresolved (§5 "Open Bugs"). */
const OPEN_BUG_STATUSES = `('new','converted','reopened')`;
/** Bugs removed from the list entirely — never counted as defects of a submission. */
const DEAD_BUG_STATUSES = `('trash','archived')`;
/** Severity keys treated as "critical" for the §17 sign-off warning. */
const CRITICAL_SEVERITIES = new Set(['blocker', 'critical']);
const HIGH_SEVERITIES = new Set(['major', 'high']);
const MEDIUM_SEVERITIES = new Set(['medium', 'normal']);
const LOW_SEVERITIES = new Set(['minor', 'low', 'trivial']);

// ─── Small helpers ───────────────────────────────────────────────────────────

const auth = (req: Request) => ({
  tenantId: (req as any).user?.tenantId as string | undefined,
  userId: (req as any).user?.id as string | undefined,
  role: (req as any).user?.role as string | undefined,
});

const fail = (res: Response, code: number, error: string) =>
  res.status(code).json({ success: false, error });

const int = (v: any) => parseInt(String(v ?? 0), 10) || 0;

const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

/** Records a timeline entry. Never throws — history must not fail a transition. */
async function addHistory(
  submissionId: string,
  tenantId: string,
  actorId: string | undefined,
  eventType: string,
  title: string,
  detail?: string | null,
  meta: Record<string, any> = {},
  runner: { query: Function } = pool,
) {
  try {
    await runner.query(
      `INSERT INTO qa_submission_history
         (tenant_id, submission_id, event_type, title, detail, meta, actor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [tenantId, submissionId, eventType, title, detail || null, JSON.stringify(meta), actorId || null],
    );
  } catch (e) {
    console.error('Failed to write submission history:', e);
  }
}

/** The submission row plus the display names the UI needs, or null. */
async function loadSubmissionRow(id: string, tenantId: string) {
  const { rows } = await pool.query(
    `SELECT s.*,
            sc.name  AS scope_name, sc.type AS scope_type, sc.status AS scope_status,
            sc.priority AS scope_priority, sc.qa_owner AS scope_qa_owner,
            sc.start_date AS scope_start_date, sc.end_date AS scope_end_date,
            sc.details AS scope_details,
            owner.name    AS qa_owner_name,    owner.avatar_url    AS qa_owner_avatar,
            reviewer.name AS reviewer_name,    reviewer.avatar_url AS reviewer_avatar,
            signer.name   AS signed_off_by_name,
            approver.name AS approved_by_name,
            sender.name   AS sent_back_by_name,
            submitter.name AS submitted_by_name,
            creator.name  AS created_by_name
       FROM qa_submissions s
       LEFT JOIN qa_test_scopes sc ON sc.id = s.scope_id
       LEFT JOIN users owner     ON owner.id::text    = s.qa_owner_id::text
       LEFT JOIN users reviewer  ON reviewer.id::text = s.reviewer_id::text
       LEFT JOIN users signer    ON signer.id::text   = s.signed_off_by::text
       LEFT JOIN users approver  ON approver.id::text = s.approved_by::text
       LEFT JOIN users sender    ON sender.id::text   = s.sent_back_by::text
       LEFT JOIN users submitter ON submitter.id::text = s.submitted_by::text
       LEFT JOIN users creator   ON creator.id::text  = s.created_by::text
      WHERE s.id = $1 AND s.tenant_id = $2`,
    [id, tenantId],
  );
  return rows[0] || null;
}

// ─── Derived statistics ──────────────────────────────────────────────────────

/**
 * The CTE every summary query builds on.
 *
 * `effective` collapses the linked runs down to one row per test case, which is
 * what makes retesting read correctly: a scope of 150 cases stays 150 cases
 * after a 10-case retest run is added, and those 10 cases report their retest
 * outcome rather than being counted twice (§10, §34).
 *
 * The ordering prefers an *executed* result over an unexecuted one before
 * preferring the newest run. Without that, creating a retest run — which seeds
 * a "Not Executed" row for every case in the suite — would blank out results
 * that were already recorded.
 *
 * $1 = submission id, $2 = tenant id
 */
const EFFECTIVE_CTE = `
  WITH linked AS (
    SELECT sr.run_id, sr.run_role,
           COALESCE(tr.completed_at, tr.started_at, tr.created_at) AS run_time
      FROM qa_submission_runs sr
      JOIN qa_test_runs tr ON tr.id = sr.run_id
     WHERE sr.submission_id = $1 AND sr.tenant_id = $2
  ),
  effective AS (
    SELECT DISTINCT ON (trr.test_case_id)
           trr.test_case_id, trr.id AS result_id, trr.status, trr.bug_id, trr.notes,
           trr.executed_at, l.run_id, l.run_role
      FROM qa_test_run_results trr
      JOIN linked l ON l.run_id = trr.test_run_id
     ORDER BY trr.test_case_id,
              (trr.status IS NOT NULL AND trr.status <> 'Not Executed') DESC,
              l.run_time DESC NULLS LAST,
              trr.executed_at DESC NULLS LAST
  )
`;

type ExecutionSummary = {
  totalCases: number;
  executed: number;
  passed: number;
  failed: number;
  blocked: number;
  notExecuted: number;
  passRate: number;
  executionRate: number;
};

async function getExecutionSummary(id: string, tenantId: string): Promise<ExecutionSummary> {
  const { rows } = await pool.query(
    `${EFFECTIVE_CTE}
     SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'Pass')::int    AS passed,
            COUNT(*) FILTER (WHERE status = 'Fail')::int    AS failed,
            COUNT(*) FILTER (WHERE status = 'Blocked')::int AS blocked,
            COUNT(*) FILTER (WHERE status IS NULL OR status = 'Not Executed')::int AS not_executed
       FROM effective`,
    [id, tenantId],
  );
  const r = rows[0] || {};
  const totalCases = int(r.total);
  const notExecuted = int(r.not_executed);
  const executed = totalCases - notExecuted;
  const passed = int(r.passed);
  return {
    totalCases,
    executed,
    passed,
    failed: int(r.failed),
    blocked: int(r.blocked),
    notExecuted,
    // Pass rate is measured against what was executed — an unexecuted case is
    // not a failure, and counting it as one understates a partial run.
    passRate: pct(passed, executed),
    executionRate: pct(executed, totalCases),
  };
}

/** Runs linked to the submission, each with its own execution breakdown (§8). */
async function getLinkedRuns(id: string, tenantId: string) {
  const { rows } = await pool.query(
    `SELECT sr.run_id AS id, sr.run_role, sr.created_at AS linked_at,
            tr.run_name, tr.status AS run_status, tr.execution_type,
            tr.started_at, tr.completed_at, tr.suite_id, tr.scope_id,
            ts.suite_name,
            COUNT(trr.id)::int AS total_cases,
            COUNT(trr.id) FILTER (WHERE trr.status = 'Pass')::int    AS passed,
            COUNT(trr.id) FILTER (WHERE trr.status = 'Fail')::int    AS failed,
            COUNT(trr.id) FILTER (WHERE trr.status = 'Blocked')::int AS blocked,
            COUNT(trr.id) FILTER (WHERE trr.status IS NULL OR trr.status = 'Not Executed')::int AS not_executed
       FROM qa_submission_runs sr
       JOIN qa_test_runs tr ON tr.id = sr.run_id
       LEFT JOIN qa_test_suites ts ON ts.id = tr.suite_id
       LEFT JOIN qa_test_run_results trr ON trr.test_run_id = tr.id
      WHERE sr.submission_id = $1 AND sr.tenant_id = $2
      GROUP BY sr.run_id, sr.run_role, sr.created_at, tr.run_name, tr.status,
               tr.execution_type, tr.started_at, tr.completed_at, tr.suite_id,
               tr.scope_id, tr.created_at, ts.suite_name
      ORDER BY sr.run_role ASC, COALESCE(tr.completed_at, tr.started_at, tr.created_at) ASC`,
    [id, tenantId],
  );
  return rows.map((r: any) => {
    const total = int(r.total_cases);
    const notExecuted = int(r.not_executed);
    return {
      ...r,
      total_cases: total,
      passed: int(r.passed),
      failed: int(r.failed),
      blocked: int(r.blocked),
      not_executed: notExecuted,
      execution_percentage: pct(total - notExecuted, total),
    };
  });
}

/**
 * Defects discovered by the linked runs (§12).
 *
 * Scanned across *every* linked run rather than the effective per-case result:
 * a bug found in the initial run is still a defect this submission reports,
 * even once the case passes on retest.
 */
async function getBugSummary(id: string, tenantId: string) {
  const { rows } = await pool.query(
    `${EFFECTIVE_CTE}
     SELECT b.id, b.bug_number, b.title, b.severity, b.status, b.bug_status,
            b.ticket_id, b.sheet_id, b.folder_id,
            t.ticket_number, t.status AS ticket_status, t.title AS ticket_title
       FROM (
         SELECT DISTINCT trr.bug_id
           FROM qa_test_run_results trr
           JOIN linked l ON l.run_id = trr.test_run_id
          WHERE trr.bug_id IS NOT NULL
       ) ids
       JOIN bugs b ON b.id::text = ids.bug_id
                  AND b.tenant_id = $2::text
                  AND b.status NOT IN ${DEAD_BUG_STATUSES}
       LEFT JOIN tickets t ON t.id = b.ticket_id
      ORDER BY b.bug_number ASC NULLS LAST`,
    [id, tenantId],
  );

  const severityCounts: Record<string, number> = {};
  let critical = 0, high = 0, medium = 0, low = 0;
  let open = 0, resolved = 0, reopened = 0;

  for (const b of rows) {
    const sev = String(b.severity || 'unspecified').toLowerCase();
    severityCounts[sev] = (severityCounts[sev] || 0) + 1;
    if (CRITICAL_SEVERITIES.has(sev)) critical += 1;
    else if (HIGH_SEVERITIES.has(sev)) high += 1;
    else if (MEDIUM_SEVERITIES.has(sev)) medium += 1;
    else if (LOW_SEVERITIES.has(sev)) low += 1;

    if (b.status === 'verified') resolved += 1;
    if (b.status === 'reopened') reopened += 1;
    if (['new', 'converted', 'reopened'].includes(b.status)) open += 1;
  }

  const criticalOpen = rows.filter(
    (b: any) =>
      CRITICAL_SEVERITIES.has(String(b.severity || '').toLowerCase()) &&
      ['new', 'converted', 'reopened'].includes(b.status),
  ).length;

  // Development tickets reached through the bugs (§13). Counted distinctly —
  // several bugs commonly map onto one ticket.
  const ticketMap = new Map<string, any>();
  for (const b of rows) {
    if (!b.ticket_id || ticketMap.has(b.ticket_id)) continue;
    ticketMap.set(b.ticket_id, {
      id: b.ticket_id,
      ticket_number: b.ticket_number,
      title: b.ticket_title,
      status: b.ticket_status,
    });
  }
  const tickets = [...ticketMap.values()];
  const ticketsResolved = tickets.filter((t) => t.status === 'completed').length;

  return {
    bugs: rows,
    summary: {
      total: rows.length,
      open,
      resolved,
      reopened,
      critical,
      high,
      medium,
      low,
      criticalOpen,
      bySeverity: severityCounts,
    },
    tickets: {
      list: tickets,
      bugsCreated: rows.length,
      created: tickets.length,
      resolved: ticketsResolved,
      open: tickets.length - ticketsResolved,
    },
  };
}

/** Cases whose effective result is a failure, with their bug/ticket trail (§14). */
async function getFailedCases(id: string, tenantId: string) {
  const { rows } = await pool.query(
    `${EFFECTIVE_CTE}
     SELECT e.test_case_id, e.status, e.notes, e.executed_at, e.run_id, e.run_role,
            tc.test_case_id AS case_ref, tc.name AS case_name, tc.severity, tc.priority,
            tr.run_name,
            b.id AS bug_id, b.bug_number, b.title AS bug_title, b.status AS bug_status_key,
            b.bug_status AS bug_progress, b.severity AS bug_severity, b.sheet_id AS bug_sheet_id,
            t.id AS ticket_id, t.ticket_number, t.title AS ticket_title, t.status AS ticket_status
       FROM effective e
       JOIN qa_test_cases tc ON tc.id = e.test_case_id
       LEFT JOIN qa_test_runs tr ON tr.id = e.run_id
       LEFT JOIN bugs b ON b.id::text = e.bug_id
                       AND b.tenant_id = $2::text
                       AND b.status NOT IN ${DEAD_BUG_STATUSES}
       LEFT JOIN tickets t ON t.id = b.ticket_id
      WHERE e.status = 'Fail'
      ORDER BY tc.test_case_id ASC`,
    [id, tenantId],
  );
  return rows;
}

/** Cases behind a given result bucket, for the click-through in §11. */
async function getCasesByStatus(id: string, tenantId: string, status: string) {
  const notExecuted = status === 'Not Executed';
  const { rows } = await pool.query(
    `${EFFECTIVE_CTE}
     SELECT e.test_case_id, e.status, e.notes, e.executed_at, e.run_id,
            tc.test_case_id AS case_ref, tc.name AS case_name,
            tc.severity, tc.priority, tc.test_type,
            tr.run_name
       FROM effective e
       JOIN qa_test_cases tc ON tc.id = e.test_case_id
       LEFT JOIN qa_test_runs tr ON tr.id = e.run_id
      WHERE ${notExecuted ? `(e.status IS NULL OR e.status = 'Not Executed')` : `e.status = $3`}
      ORDER BY tc.test_case_id ASC`,
    notExecuted ? [id, tenantId] : [id, tenantId, status],
  );
  return rows;
}

/**
 * Retesting progress (§15): of the cases that failed in the initial runs, how
 * many have since been re-executed in a retest run and how they landed.
 */
async function getRetestSummary(id: string, tenantId: string) {
  const { rows } = await pool.query(
    `WITH linked AS (
       SELECT sr.run_id, sr.run_role,
              COALESCE(tr.completed_at, tr.started_at, tr.created_at) AS run_time
         FROM qa_submission_runs sr
         JOIN qa_test_runs tr ON tr.id = sr.run_id
        WHERE sr.submission_id = $1 AND sr.tenant_id = $2
     ),
     initial_failed AS (
       SELECT DISTINCT trr.test_case_id
         FROM qa_test_run_results trr
         JOIN linked l ON l.run_id = trr.test_run_id
        WHERE l.run_role = 'initial' AND trr.status = 'Fail'
     ),
     retest_latest AS (
       SELECT DISTINCT ON (trr.test_case_id) trr.test_case_id, trr.status
         FROM qa_test_run_results trr
         JOIN linked l ON l.run_id = trr.test_run_id
        WHERE l.run_role = 'retest'
          AND trr.status IS NOT NULL AND trr.status <> 'Not Executed'
        ORDER BY trr.test_case_id, l.run_time DESC NULLS LAST, trr.executed_at DESC NULLS LAST
     )
     SELECT
       (SELECT COUNT(*) FROM initial_failed)::int AS failed_initially,
       (SELECT COUNT(*) FROM initial_failed f JOIN retest_latest r USING (test_case_id))::int AS retested,
       (SELECT COUNT(*) FROM initial_failed f JOIN retest_latest r USING (test_case_id)
         WHERE r.status = 'Pass')::int AS passed_after_retest,
       (SELECT COUNT(*) FROM initial_failed f JOIN retest_latest r USING (test_case_id)
         WHERE r.status = 'Fail')::int AS still_failed`,
    [id, tenantId],
  );
  const r = rows[0] || {};
  const failedInitially = int(r.failed_initially);
  const retested = int(r.retested);
  const stillFailed = int(r.still_failed);

  let status: string;
  if (failedInitially === 0 || retested === 0) status = 'Not Started';
  else if (retested < failedInitially) status = 'Partially Retested';
  else if (stillFailed > 0) status = 'Retesting In Progress';
  else status = 'Retesting Completed';

  return {
    failedInitially,
    retested,
    passedAfterRetest: int(r.passed_after_retest),
    stillFailed,
    status,
  };
}

/**
 * The advisory warnings shown beside the recommendation (§17).
 *
 * These never block on their own — QA reports what it found, and the policy
 * decision stays with the person signing off.
 */
function buildWarnings(execution: ExecutionSummary, bugs: { criticalOpen: number; open: number }) {
  const warnings: Array<{ level: 'critical' | 'warning'; code: string; message: string }> = [];
  if (bugs.criticalOpen > 0) {
    warnings.push({
      level: 'critical',
      code: 'CRITICAL_BUGS_OPEN',
      message: 'Critical bugs are still open. QA Sign-off may not be appropriate.',
    });
  }
  if (execution.failed > 0) {
    warnings.push({
      level: 'warning',
      code: 'FAILED_CASES',
      message: `${execution.failed} test case${execution.failed === 1 ? '' : 's'} failed in the selected runs.`,
    });
  }
  if (execution.notExecuted > 0) {
    warnings.push({
      level: 'warning',
      code: 'NOT_EXECUTED',
      message: 'Some planned test cases have not been executed.',
    });
  }
  if (execution.blocked > 0) {
    warnings.push({
      level: 'warning',
      code: 'BLOCKED',
      message: 'Blocked test cases remain in the selected runs.',
    });
  }
  return warnings;
}

/** Everything derived, assembled once. Used by the detail view and by sign-off. */
async function buildFullSummary(id: string, tenantId: string) {
  const [execution, runs, bugData, failedCases, retest] = await Promise.all([
    getExecutionSummary(id, tenantId),
    getLinkedRuns(id, tenantId),
    getBugSummary(id, tenantId),
    getFailedCases(id, tenantId),
    getRetestSummary(id, tenantId),
  ]);
  return {
    execution,
    runs,
    bugs: bugData.summary,
    bugList: bugData.bugs,
    tickets: bugData.tickets,
    failedCases,
    retest,
    warnings: buildWarnings(execution, bugData.summary),
  };
}

/** Keeps the persisted retesting_status in step with the live run data. */
async function syncRetestingStatus(id: string, tenantId: string, current: string, next: string) {
  if (current === next) return next;
  await pool.query(
    `UPDATE qa_submissions SET retesting_status = $1, updated_at = NOW()
      WHERE id = $2 AND tenant_id = $3`,
    [next, id, tenantId],
  );
  return next;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

/** Summary cards for the QA Submissions dashboard (§4). */
export const getSubmissionStats = async (req: Request, res: Response) => {
  try {
    const { tenantId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'Draft')::int                 AS draft,
              COUNT(*) FILTER (WHERE status IN ('Submitted','Under Review'))::int AS submitted,
              COUNT(*) FILTER (WHERE status = 'Retesting')::int             AS retesting,
              COUNT(*) FILTER (WHERE status = 'Ready for QA Sign-off')::int AS ready_for_signoff,
              COUNT(*) FILTER (WHERE status = 'QA Signed-off')::int         AS qa_signed_off,
              COUNT(*) FILTER (WHERE status = 'Approved')::int              AS approved,
              COUNT(*) FILTER (WHERE status = 'Sent Back')::int             AS sent_back
         FROM qa_submissions WHERE tenant_id = $1`,
      [tenantId],
    );
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error fetching QA submission stats:', error);
    fail(res, 500, 'Internal Server Error');
  }
};

// ─── List ────────────────────────────────────────────────────────────────────

const LIST_SORTABLE: Record<string, string> = {
  submission_name: 's.submission_name',
  status: 's.status',
  submitted_at: 's.submitted_at',
  created_at: 's.created_at',
  updated_at: 's.updated_at',
  qa_recommendation: 's.qa_recommendation',
};

/** Paginated, filterable submission list (§5). */
export const getSubmissions = async (req: Request, res: Response) => {
  try {
    const { tenantId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const page = Math.max(1, int(req.query.page) || 1);
    const pageSize = Math.min(Math.max(int(req.query.pageSize) || 20, 1), 200);
    const search = String(req.query.search ?? '').trim();
    const scopeId = String(req.query.scopeId ?? '').trim();
    const qaOwnerId = String(req.query.qaOwnerId ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const recommendation = String(req.query.recommendation ?? '').trim();
    const fromDate = String(req.query.from ?? '').trim();
    const toDate = String(req.query.to ?? '').trim();
    const sortBy = LIST_SORTABLE[String(req.query.sortBy ?? '')] || 's.updated_at';
    const sortDir = String(req.query.sortDir ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const params: any[] = [tenantId];
    let where = 's.tenant_id = $1';
    // One bound value per clause; every `$$` in the clause resolves to it, so a
    // clause may reference the same value more than once (the search does).
    const push = (clause: string, value: any) => {
      params.push(value);
      where += ` AND ${clause.replace(/\$\$/g, `$${params.length}`)}`;
    };

    if (search) push('(s.submission_name ILIKE $$ OR sc.name ILIKE $$)', `%${search}%`);
    if (scopeId) push('s.scope_id = $$::uuid', scopeId);
    if (qaOwnerId) push('s.qa_owner_id = $$::uuid', qaOwnerId);
    // Accepts one status or a comma-separated set — the Approvals list asks for
    // every status that counts as "reported" in a single call.
    if (status) {
      const wanted = status.split(',').map((s) => s.trim()).filter(Boolean);
      if (wanted.length === 1) push('s.status = $$', wanted[0]);
      else if (wanted.length > 1) push('s.status = ANY($$::text[])', wanted);
    }
    if (recommendation) push('s.qa_recommendation = $$', recommendation);
    // Filter on the submission date where there is one, otherwise creation —
    // a draft has no submitted_at but still belongs on a date-filtered list.
    if (fromDate) push('COALESCE(s.submitted_at, s.created_at) >= $$::timestamptz', fromDate);
    if (toDate) push('COALESCE(s.submitted_at, s.created_at) < ($$::timestamptz + INTERVAL \'1 day\')', toDate);

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total
         FROM qa_submissions s
         LEFT JOIN qa_test_scopes sc ON sc.id = s.scope_id
        WHERE ${where}`,
      params,
    );
    const total = int(countRows[0]?.total);

    params.push(pageSize, (page - 1) * pageSize);
    const { rows } = await pool.query(
      `SELECT s.id, s.submission_name, s.scope_id, s.submission_type, s.status,
              s.retesting_status, s.qa_recommendation, s.version,
              s.submitted_at, s.created_at, s.updated_at,
              s.signed_off_at, s.approved_at,
              sc.name AS scope_name, sc.type AS scope_type,
              owner.name AS qa_owner_name, owner.avatar_url AS qa_owner_avatar,
              s.qa_owner_id,
              (SELECT COUNT(*)::int FROM qa_submission_runs r
                WHERE r.submission_id = s.id) AS run_count
         FROM qa_submissions s
         LEFT JOIN qa_test_scopes sc ON sc.id = s.scope_id
         LEFT JOIN users owner ON owner.id::text = s.qa_owner_id::text
        WHERE ${where}
        ORDER BY ${sortBy} ${sortDir} NULLS LAST
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const ids = rows.map((r: any) => r.id);
    if (ids.length) {
      // One pass for the whole page rather than per-row summary queries. Same
      // "effective result per case" rule as the detail view, grouped by
      // submission so retest runs don't inflate the totals.
      const [{ rows: execRows }, { rows: bugRows }] = await Promise.all([
        pool.query(
          `WITH linked AS (
             SELECT sr.submission_id, sr.run_id,
                    COALESCE(tr.completed_at, tr.started_at, tr.created_at) AS run_time
               FROM qa_submission_runs sr
               JOIN qa_test_runs tr ON tr.id = sr.run_id
              WHERE sr.tenant_id = $1 AND sr.submission_id = ANY($2::uuid[])
           ),
           effective AS (
             SELECT DISTINCT ON (l.submission_id, trr.test_case_id)
                    l.submission_id, trr.test_case_id, trr.status
               FROM qa_test_run_results trr
               JOIN linked l ON l.run_id = trr.test_run_id
              ORDER BY l.submission_id, trr.test_case_id,
                       (trr.status IS NOT NULL AND trr.status <> 'Not Executed') DESC,
                       l.run_time DESC NULLS LAST,
                       trr.executed_at DESC NULLS LAST
           )
           SELECT submission_id,
                  COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE status = 'Pass')::int    AS passed,
                  COUNT(*) FILTER (WHERE status = 'Fail')::int    AS failed,
                  COUNT(*) FILTER (WHERE status = 'Blocked')::int AS blocked,
                  COUNT(*) FILTER (WHERE status IS NULL OR status = 'Not Executed')::int AS not_executed
             FROM effective GROUP BY submission_id`,
          [tenantId, ids],
        ),
        pool.query(
          `WITH linked AS (
             SELECT sr.submission_id, sr.run_id
               FROM qa_submission_runs sr
              WHERE sr.tenant_id = $1 AND sr.submission_id = ANY($2::uuid[])
           )
           SELECT l.submission_id,
                  COUNT(DISTINCT b.id)::int AS total_bugs,
                  COUNT(DISTINCT b.id) FILTER (WHERE b.status IN ${OPEN_BUG_STATUSES})::int AS open_bugs
             FROM linked l
             JOIN qa_test_run_results trr ON trr.test_run_id = l.run_id AND trr.bug_id IS NOT NULL
             JOIN bugs b ON b.id::text = trr.bug_id
                        AND b.tenant_id = $1::text
                        AND b.status NOT IN ${DEAD_BUG_STATUSES}
            GROUP BY l.submission_id`,
          [tenantId, ids],
        ),
      ]);

      const execById = new Map(execRows.map((r: any) => [r.submission_id, r]));
      const bugById = new Map(bugRows.map((r: any) => [r.submission_id, r]));

      for (const row of rows as any[]) {
        const e = execById.get(row.id) || {};
        const b = bugById.get(row.id) || {};
        const totalCases = int(e.total);
        const notExecuted = int(e.not_executed);
        const executed = totalCases - notExecuted;
        row.total_cases = totalCases;
        row.passed = int(e.passed);
        row.failed = int(e.failed);
        row.blocked = int(e.blocked);
        row.not_executed = notExecuted;
        row.executed = executed;
        row.pass_rate = pct(int(e.passed), executed);
        row.execution_rate = pct(executed, totalCases);
        row.total_bugs = int(b.total_bugs);
        row.open_bugs = int(b.open_bugs);
      }
    }

    res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    console.error('Error fetching QA submissions:', error);
    fail(res, 500, 'Internal Server Error');
  }
};

// ─── Run picker ──────────────────────────────────────────────────────────────

/**
 * Runs offered as testing evidence for a scope (§8, §9).
 *
 * Runs carrying this scope_id come first. Runs with no scope are offered too
 * and flagged `unattributed` — the scope link is newer than the Runs module, so
 * refusing to show older runs would make the picker empty on existing data.
 *
 * Each row reports whether it is already used by another live submission for
 * the same scope. That is surfaced, not enforced: §9 allows a deliberate reuse.
 */
export const getScopeRuns = async (req: Request, res: Response) => {
  try {
    const { tenantId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const scopeId = String(req.query.scopeId ?? '').trim();
    if (!scopeId) return fail(res, 400, 'scopeId is required');
    const excludeId = String(req.query.excludeSubmissionId ?? '').trim() || null;

    const { rows } = await pool.query(
      `SELECT tr.id, tr.run_name, tr.status AS run_status, tr.execution_type,
              tr.started_at, tr.completed_at, tr.suite_id, tr.scope_id,
              ts.suite_name,
              (tr.scope_id IS NULL) AS unattributed,
              COUNT(trr.id)::int AS total_cases,
              COUNT(trr.id) FILTER (WHERE trr.status = 'Pass')::int    AS passed,
              COUNT(trr.id) FILTER (WHERE trr.status = 'Fail')::int    AS failed,
              COUNT(trr.id) FILTER (WHERE trr.status = 'Blocked')::int AS blocked,
              COUNT(trr.id) FILTER (WHERE trr.status IS NULL OR trr.status = 'Not Executed')::int AS not_executed,
              COALESCE(used.names, ARRAY[]::text[]) AS used_by
         FROM qa_test_runs tr
         LEFT JOIN qa_test_suites ts ON ts.id = tr.suite_id
         LEFT JOIN qa_test_run_results trr ON trr.test_run_id = tr.id
         LEFT JOIN LATERAL (
           SELECT ARRAY_AGG(s.submission_name::text ORDER BY s.created_at) AS names
             FROM qa_submission_runs sr
             JOIN qa_submissions s ON s.id = sr.submission_id
            WHERE sr.run_id = tr.id
              AND s.tenant_id = tr.tenant_id
              AND s.scope_id = $2::uuid
              AND s.status <> 'Sent Back'
              AND ($3::uuid IS NULL OR s.id <> $3::uuid)
         ) used ON TRUE
        WHERE tr.tenant_id = $1
          AND (tr.scope_id = $2::uuid OR tr.scope_id IS NULL)
        GROUP BY tr.id, tr.run_name, tr.status, tr.execution_type, tr.started_at,
                 tr.completed_at, tr.suite_id, tr.scope_id, tr.created_at,
                 ts.suite_name, used.names
        ORDER BY (tr.scope_id IS NULL) ASC,
                 COALESCE(tr.completed_at, tr.started_at, tr.created_at) DESC`,
      [tenantId, scopeId, excludeId],
    );

    const data = rows.map((r: any) => {
      const total = int(r.total_cases);
      const notExecuted = int(r.not_executed);
      const executed = total - notExecuted;
      return {
        ...r,
        total_cases: total,
        passed: int(r.passed),
        failed: int(r.failed),
        blocked: int(r.blocked),
        not_executed: notExecuted,
        executed,
        execution_percentage: pct(executed, total),
        already_submitted: (r.used_by || []).length > 0,
        // A run nobody has executed yet is not evidence of anything (§8).
        selectable: total > 0 && executed > 0,
      };
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error fetching scope runs:', error);
    fail(res, 500, 'Internal Server Error');
  }
};

// ─── Detail ──────────────────────────────────────────────────────────────────

export const getSubmission = async (req: Request, res: Response) => {
  try {
    const { tenantId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { id } = req.params;
    const submission = await loadSubmissionRow(id, tenantId);
    if (!submission) return fail(res, 404, 'QA Submission not found');

    const [summary, knownIssues, attachments, history, versions] = await Promise.all([
      buildFullSummary(id, tenantId),
      pool.query(
        `SELECT ki.*, b.title AS bug_title, b.severity AS bug_severity, b.status AS bug_live_status
           FROM qa_submission_known_issues ki
           LEFT JOIN bugs b ON b.id::text = ki.bug_id AND b.tenant_id = $2::text
          WHERE ki.submission_id = $1
          ORDER BY ki.position ASC, ki.created_at ASC`,
        [id, tenantId],
      ),
      pool.query(
        `SELECT a.*, u.name AS uploaded_by_name
           FROM qa_submission_attachments a
           LEFT JOIN users u ON u.id::text = a.uploaded_by::text
          WHERE a.submission_id = $1
          ORDER BY a.created_at ASC`,
        [id],
      ),
      pool.query(
        `SELECT h.*, u.name AS actor_name, u.avatar_url AS actor_avatar
           FROM qa_submission_history h
           LEFT JOIN users u ON u.id::text = h.actor_id::text
          WHERE h.submission_id = $1
          ORDER BY h.created_at DESC`,
        [id],
      ),
      pool.query(
        `SELECT v.version, v.note, v.created_at, u.name AS created_by_name,
                v.snapshot->'execution' AS execution
           FROM qa_submission_versions v
           LEFT JOIN users u ON u.id::text = v.created_by::text
          WHERE v.submission_id = $1
          ORDER BY v.version DESC`,
        [id],
      ),
    ]);

    submission.retesting_status = await syncRetestingStatus(
      id,
      tenantId,
      submission.retesting_status,
      summary.retest.status,
    );

    res.status(200).json({
      success: true,
      data: {
        ...submission,
        // §24 — a signed-off submission reports the frozen numbers, so the
        // record stays historically accurate even as later runs change.
        summary: submission.signoff_snapshot?.summary ?? summary,
        liveSummary: summary,
        isSnapshot: !!submission.signoff_snapshot,
        knownIssues: knownIssues.rows,
        attachments: attachments.rows,
        history: history.rows,
        versions: versions.rows,
      },
    });
  } catch (error) {
    console.error('Error fetching QA submission:', error);
    fail(res, 500, 'Internal Server Error');
  }
};

/** Cases behind a result count, for the §11 click-through. */
export const getSubmissionCases = async (req: Request, res: Response) => {
  try {
    const { tenantId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { id } = req.params;
    const status = String(req.query.status ?? 'Fail');
    if (!['Pass', 'Fail', 'Blocked', 'Not Executed'].includes(status)) {
      return fail(res, 400, 'Unknown result status');
    }
    const owner = await loadSubmissionRow(id, tenantId);
    if (!owner) return fail(res, 404, 'QA Submission not found');

    const data = status === 'Fail'
      ? await getFailedCases(id, tenantId)
      : await getCasesByStatus(id, tenantId, status);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error fetching submission cases:', error);
    fail(res, 500, 'Internal Server Error');
  }
};

// ─── Create / update / delete ────────────────────────────────────────────────

/** Runs must exist, belong to the tenant, and not already sit in this submission. */
async function replaceRuns(
  client: any,
  submissionId: string,
  tenantId: string,
  userId: string | undefined,
  runs: Array<{ runId: string; role?: string }>,
) {
  const ids = runs.map((r) => r.runId).filter(Boolean);
  if (ids.length) {
    const { rows } = await client.query(
      `SELECT id FROM qa_test_runs WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
      [tenantId, ids],
    );
    if (rows.length !== new Set(ids).size) {
      throw Object.assign(new Error('One or more selected test runs could not be found'), { status: 400 });
    }
  }

  await client.query(`DELETE FROM qa_submission_runs WHERE submission_id = $1 AND tenant_id = $2`, [
    submissionId,
    tenantId,
  ]);
  for (const run of runs) {
    await client.query(
      `INSERT INTO qa_submission_runs (tenant_id, submission_id, run_id, run_role, added_by)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (submission_id, run_id) DO UPDATE SET run_role = EXCLUDED.run_role`,
      [tenantId, submissionId, run.runId, run.role === 'retest' ? 'retest' : 'initial', userId || null],
    );
  }
}

export const createSubmission = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { tenantId, userId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const {
      submission_name,
      scope_id,
      submission_type,
      qa_owner_id,
      reviewer_id,
      description,
      qa_summary,
      qa_recommendation,
      recommendation_ack,
      recommendation_ack_note,
      runs = [],
    } = req.body || {};

    if (!submission_name || !String(submission_name).trim()) {
      return fail(res, 400, 'Submission Name is required');
    }
    if (!scope_id) return fail(res, 400, 'Test Scope is required'); // §33.1
    if (submission_type && !SUBMISSION_TYPES.includes(submission_type)) {
      return fail(res, 400, `Unknown submission type "${submission_type}"`);
    }
    if (qa_recommendation && !RECOMMENDATIONS.includes(qa_recommendation)) {
      return fail(res, 400, `Unknown QA recommendation "${qa_recommendation}"`);
    }

    const { rows: scopeRows } = await client.query(
      `SELECT id, details FROM qa_test_scopes WHERE id = $1 AND tenant_id = $2`,
      [scope_id, tenantId],
    );
    if (!scopeRows.length) return fail(res, 404, 'Test Scope not found');

    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO qa_submissions
         (tenant_id, submission_name, scope_id, submission_type, qa_owner_id, reviewer_id,
          description, qa_summary, qa_recommendation, recommendation_ack, recommendation_ack_note,
          status, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Draft',$12,$12)
       RETURNING *`,
      [
        tenantId,
        String(submission_name).trim(),
        scope_id,
        submission_type || 'Testing Completion',
        qa_owner_id || userId || null,
        reviewer_id || null,
        description || null,
        qa_summary || null,
        qa_recommendation || null,
        !!recommendation_ack,
        recommendation_ack_note || null,
        userId || null,
      ],
    );
    const submission = rows[0];

    if (Array.isArray(runs) && runs.length) {
      await replaceRuns(client, submission.id, tenantId, userId, runs);
    }

    await addHistory(
      submission.id,
      tenantId,
      userId,
      'created',
      'QA Submission created',
      null,
      { submissionType: submission.submission_type },
      client,
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: submission });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    if (error?.status === 400) return fail(res, 400, error.message);
    console.error('Error creating QA submission:', error);
    fail(res, 500, 'Internal Server Error');
  } finally {
    client.release();
  }
};

/** Fields QA may edit directly. Execution counts are absent by design (§33.4). */
const EDITABLE_FIELDS: Record<string, string> = {
  submission_name: 'submission_name',
  submission_type: 'submission_type',
  qa_owner_id: 'qa_owner_id',
  reviewer_id: 'reviewer_id',
  description: 'description',
  qa_summary: 'qa_summary',
  qa_recommendation: 'qa_recommendation',
  recommendation_ack: 'recommendation_ack',
  recommendation_ack_note: 'recommendation_ack_note',
  scope_id: 'scope_id',
};

export const updateSubmission = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { tenantId, userId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { id } = req.params;
    const existing = await loadSubmissionRow(id, tenantId);
    if (!existing) return fail(res, 404, 'QA Submission not found');

    // §24 — the sign-off record is a historical statement, not a live document.
    if (existing.status === 'QA Signed-off' || existing.status === 'Approved') {
      return fail(
        res,
        409,
        'This submission has been signed off and can no longer be edited. Ask a QA Manager to reopen it first.',
      );
    }

    const body = req.body || {};
    if (body.submission_type && !SUBMISSION_TYPES.includes(body.submission_type)) {
      return fail(res, 400, `Unknown submission type "${body.submission_type}"`);
    }
    if (body.qa_recommendation && !RECOMMENDATIONS.includes(body.qa_recommendation)) {
      return fail(res, 400, `Unknown QA recommendation "${body.qa_recommendation}"`);
    }
    if (body.scope_id && body.scope_id !== existing.scope_id) {
      const { rows } = await client.query(
        `SELECT id FROM qa_test_scopes WHERE id = $1 AND tenant_id = $2`,
        [body.scope_id, tenantId],
      );
      if (!rows.length) return fail(res, 404, 'Test Scope not found');
    }

    await client.query('BEGIN');

    const sets: string[] = [];
    const params: any[] = [];
    for (const [key, column] of Object.entries(EDITABLE_FIELDS)) {
      if (body[key] === undefined) continue;
      params.push(body[key] === '' ? null : body[key]);
      sets.push(`${column} = $${params.length}`);
    }
    params.push(userId || null);
    sets.push(`updated_by = $${params.length}`);
    sets.push('updated_at = NOW()');

    params.push(id, tenantId);
    const { rows } = await client.query(
      `UPDATE qa_submissions SET ${sets.join(', ')}
        WHERE id = $${params.length - 1} AND tenant_id = $${params.length}
        RETURNING *`,
      params,
    );

    if (Array.isArray(body.runs)) {
      await replaceRuns(client, id, tenantId, userId, body.runs);
    }

    if (body.qa_recommendation && body.qa_recommendation !== existing.qa_recommendation) {
      await addHistory(
        id,
        tenantId,
        userId,
        'recommendation',
        `QA Recommendation set to ${body.qa_recommendation}`,
        body.recommendation_ack_note || null,
        { recommendation: body.qa_recommendation },
        client,
      );
    }

    await client.query('COMMIT');
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    if (error?.status === 400) return fail(res, 400, error.message);
    console.error('Error updating QA submission:', error);
    fail(res, 500, 'Internal Server Error');
  } finally {
    client.release();
  }
};

export const deleteSubmission = async (req: Request, res: Response) => {
  try {
    const { tenantId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { id } = req.params;
    const existing = await loadSubmissionRow(id, tenantId);
    if (!existing) return fail(res, 404, 'QA Submission not found');
    if (existing.status === 'QA Signed-off' || existing.status === 'Approved') {
      return fail(res, 409, 'A signed-off submission cannot be deleted — it is part of the QA record.');
    }

    await pool.query(`DELETE FROM qa_submissions WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    res.status(200).json({ success: true, message: 'QA Submission deleted' });
  } catch (error) {
    console.error('Error deleting QA submission:', error);
    fail(res, 500, 'Internal Server Error');
  }
};

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Submit the current testing results (§22).
 *
 * Deliberately permissive about defects: a submission reporting 140 passed /
 * 10 failed with 10 open bugs is exactly what this action is for. The only hard
 * requirement is that there is evidence to report (§33.2).
 */
export const submitSubmission = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { tenantId, userId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { id } = req.params;
    const existing = await loadSubmissionRow(id, tenantId);
    if (!existing) return fail(res, 404, 'QA Submission not found');
    if (existing.status === 'QA Signed-off' || existing.status === 'Approved') {
      return fail(res, 409, 'This submission has already been signed off.');
    }

    const summary = await buildFullSummary(id, tenantId);
    if (!summary.runs.length) {
      return fail(res, 400, 'Link at least one Test Run before submitting.');
    }

    await client.query('BEGIN');

    // A resubmission after a send-back or a retest cycle is a new version (§29).
    const isResubmission = !!existing.submitted_at;
    const nextVersion = isResubmission ? int(existing.version) + 1 : int(existing.version) || 1;

    await client.query(
      `INSERT INTO qa_submission_versions (tenant_id, submission_id, version, snapshot, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (submission_id, version) DO UPDATE
         SET snapshot = EXCLUDED.snapshot, note = EXCLUDED.note, created_at = NOW()`,
      [
        tenantId,
        id,
        nextVersion,
        JSON.stringify({
          execution: summary.execution,
          bugs: summary.bugs,
          tickets: summary.tickets,
          retest: summary.retest,
          runs: summary.runs.map((r: any) => ({
            id: r.id, run_name: r.run_name, run_role: r.run_role,
            total_cases: r.total_cases, passed: r.passed, failed: r.failed, blocked: r.blocked,
          })),
          qa_recommendation: existing.qa_recommendation,
        }),
        req.body?.note || null,
        userId || null,
      ],
    );

    const { rows } = await client.query(
      `UPDATE qa_submissions
          SET status = 'Submitted', version = $1,
              submitted_at = NOW(), submitted_by = $2,
              sent_back_reason = NULL, sent_back_at = NULL,
              sent_back_by = NULL, sent_back_stage = NULL,
              updated_by = $2, updated_at = NOW()
        WHERE id = $3 AND tenant_id = $4
        RETURNING *`,
      [nextVersion, userId || null, id, tenantId],
    );

    const e = summary.execution;
    await addHistory(
      id,
      tenantId,
      userId,
      'submitted',
      isResubmission ? `Testing resubmitted (v${nextVersion})` : 'Testing submitted',
      `${e.totalCases} cases · ${e.passed} passed · ${e.failed} failed · ${e.blocked} blocked`,
      { version: nextVersion, execution: e, bugs: summary.bugs },
      client,
    );

    await client.query('COMMIT');
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error submitting QA submission:', error);
    fail(res, 500, 'Internal Server Error');
  } finally {
    client.release();
  }
};

/** Which statuses a submission may be moved to by hand, and from where. */
const MANUAL_TRANSITIONS: Record<string, string[]> = {
  'Under Review': ['Submitted'],
  Retesting: ['Submitted', 'Under Review', 'Sent Back'],
  'Ready for QA Sign-off': ['Submitted', 'Under Review', 'Retesting'],
  Draft: ['Sent Back'],
};

export const changeSubmissionStatus = async (req: Request, res: Response) => {
  try {
    const { tenantId, userId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { id } = req.params;
    const status = String(req.body?.status ?? '');
    const allowedFrom = MANUAL_TRANSITIONS[status];
    if (!allowedFrom) {
      return fail(res, 400, `"${status}" is not a status you can move a submission to directly.`);
    }

    const existing = await loadSubmissionRow(id, tenantId);
    if (!existing) return fail(res, 404, 'QA Submission not found');
    if (!allowedFrom.includes(existing.status)) {
      return fail(res, 409, `A submission in "${existing.status}" cannot move to "${status}".`);
    }

    const { rows } = await pool.query(
      `UPDATE qa_submissions SET status = $1, updated_by = $2, updated_at = NOW()
        WHERE id = $3 AND tenant_id = $4 RETURNING *`,
      [status, userId || null, id, tenantId],
    );
    await addHistory(id, tenantId, userId, 'status', `Status changed to ${status}`, req.body?.comment || null, {
      from: existing.status,
      to: status,
    });

    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error changing submission status:', error);
    fail(res, 500, 'Internal Server Error');
  }
};

/** The review screen shown before Confirm QA Sign-off (§23). */
export const getSignoffPreview = async (req: Request, res: Response) => {
  try {
    const { tenantId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { id } = req.params;
    const submission = await loadSubmissionRow(id, tenantId);
    if (!submission) return fail(res, 404, 'QA Submission not found');

    const summary = await buildFullSummary(id, tenantId);
    const blockers: string[] = [];
    if (submission.status !== 'Approved' && submission.status !== 'QA Signed-off') {
      blockers.push('This submission must be approved before QA can sign it off.');
    }
    if (!summary.runs.length) blockers.push('Link at least one Test Run before signing off.');
    if (!submission.qa_recommendation) blockers.push('A QA Recommendation is required before sign-off.');
    // The QA Summary is no longer captured in the UI, so it cannot be a blocker
    // — the recommendation and the linked runs carry the sign-off on their own.

    res.status(200).json({
      success: true,
      data: {
        submission_name: submission.submission_name,
        scope_name: submission.scope_name,
        qa_recommendation: submission.qa_recommendation,
        qa_summary: submission.qa_summary,
        ...summary,
        blockers,
        canSignOff: blockers.length === 0,
      },
    });
  } catch (error) {
    console.error('Error building sign-off preview:', error);
    fail(res, 500, 'Internal Server Error');
  }
};

/**
 * QA Sign-off (§23, §24) — QA's final recommendation for the scope.
 *
 * Freezes a snapshot of every derived number so the record stays accurate even
 * if a later run changes the live totals. Warnings (open criticals, remaining
 * failures) are reported but do not block: the confirmation checkbox is where
 * the person signing accepts them.
 */
export const signOffSubmission = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { tenantId, userId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { id } = req.params;
    const { confirmed, comment } = req.body || {};
    if (!confirmed) {
      return fail(res, 400, 'Please confirm the sign-off statement before continuing.'); // §33.16
    }

    const existing = await loadSubmissionRow(id, tenantId);
    if (!existing) return fail(res, 404, 'QA Submission not found');
    if (existing.status === 'QA Signed-off') {
      return fail(res, 409, 'This submission has already been signed off.');
    }
    // Sign-off closes the record, and it only closes something the business has
    // already accepted — so approval is the gate, not submission (§23).
    if (existing.status !== 'Approved') {
      return fail(res, 409, 'This submission must be approved before QA can sign it off.');
    }
    if (!existing.qa_recommendation) {
      return fail(res, 400, 'A QA Recommendation is required before sign-off.'); // §16
    }

    const summary = await buildFullSummary(id, tenantId);
    if (!summary.runs.length) return fail(res, 400, 'Link at least one Test Run before signing off.');

    const { rows: knownIssues } = await client.query(
      `SELECT * FROM qa_submission_known_issues WHERE submission_id = $1 ORDER BY position ASC, created_at ASC`,
      [id],
    );

    await client.query('BEGIN');

    const snapshot = {
      takenAt: new Date().toISOString(),
      summary,
      qa_recommendation: existing.qa_recommendation,
      qa_summary: existing.qa_summary,
      knownIssues,
      version: existing.version,
    };

    // The signed-off figures also supersede this version's submit-time row, so
    // they survive a later reopen (which clears signoff_snapshot) and stay
    // readable as "what v3 was signed off with" (§29, §33.17).
    await client.query(
      `INSERT INTO qa_submission_versions (tenant_id, submission_id, version, snapshot, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (submission_id, version) DO UPDATE
         SET snapshot = EXCLUDED.snapshot, note = EXCLUDED.note, created_at = NOW()`,
      [
        tenantId,
        id,
        int(existing.version),
        JSON.stringify({ ...snapshot, execution: summary.execution }),
        `QA signed off — ${existing.qa_recommendation}`,
        userId || null,
      ],
    );

    const { rows } = await client.query(
      `UPDATE qa_submissions
          SET status = 'QA Signed-off',
              signed_off_by = $1, signed_off_at = NOW(), signoff_comment = $2,
              signoff_snapshot = $3, updated_by = $1, updated_at = NOW()
        WHERE id = $4 AND tenant_id = $5
        RETURNING *`,
      [userId || null, comment || null, JSON.stringify(snapshot), id, tenantId],
    );

    const e = summary.execution;
    await addHistory(
      id,
      tenantId,
      userId,
      'signed_off',
      'QA Sign-off completed',
      `Recommendation: ${existing.qa_recommendation} · ${e.passed}/${e.totalCases} passed · ${summary.bugs.open} open bug${summary.bugs.open === 1 ? '' : 's'}`,
      { recommendation: existing.qa_recommendation, execution: e, bugs: summary.bugs },
      client,
    );

    await client.query('COMMIT');
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error signing off QA submission:', error);
    fail(res, 500, 'Internal Server Error');
  } finally {
    client.release();
  }
};

/**
 * Approval (§26) — business acceptance, distinct from QA's recommendation.
 *
 * Any submission that has actually been reported can be approved, not only a
 * signed-off one: the approver works from the Approvals list, where a result
 * they are willing to accept should not be held up waiting on a QA sign-off
 * step. A Draft has nothing to accept yet, and an approved submission is
 * already accepted — those are the only two states this refuses.
 */
export const approveSubmission = async (req: Request, res: Response) => {
  try {
    const { tenantId, userId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { id } = req.params;
    const existing = await loadSubmissionRow(id, tenantId);
    if (!existing) return fail(res, 404, 'QA Submission not found');
    if (existing.status === 'Draft') {
      return fail(res, 409, 'This submission has not been submitted yet.');
    }
    if (existing.status === 'Approved') {
      return fail(res, 409, 'This submission has already been approved.');
    }

    const { rows } = await pool.query(
      `UPDATE qa_submissions
          SET status = 'Approved', approved_by = $1, approved_at = NOW(),
              approver_comment = $2, updated_by = $1, updated_at = NOW()
        WHERE id = $3 AND tenant_id = $4 RETURNING *`,
      [userId || null, req.body?.comment || null, id, tenantId],
    );
    await addHistory(id, tenantId, userId, 'approved', 'Approved', req.body?.comment || null);

    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error approving QA submission:', error);
    fail(res, 500, 'Internal Server Error');
  }
};

/** Send Back (§26) — always requires a reason (§33.15). */
export const sendBackSubmission = async (req: Request, res: Response) => {
  try {
    const { tenantId, userId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { id } = req.params;
    const reason = String(req.body?.reason ?? '').trim();
    if (!reason) return fail(res, 400, 'A reason is required when sending a submission back.');

    const existing = await loadSubmissionRow(id, tenantId);
    if (!existing) return fail(res, 404, 'QA Submission not found');
    if (existing.status === 'Draft') {
      return fail(res, 409, 'This submission has not been submitted yet.');
    }
    if (existing.status === 'Approved') {
      return fail(res, 409, 'An approved submission cannot be sent back.');
    }

    // A send-back after sign-off is the approver rejecting QA's recommendation;
    // before it, a reviewer asking for changes. Both land in "Sent Back" but the
    // stage is recorded so the timeline reads correctly.
    const stage = existing.status === 'QA Signed-off' ? 'approver' : 'review';

    // The sign-off didn't stick, so the submission goes back to reporting live
    // figures — leaving the frozen snapshot in place would have QA reworking
    // against numbers that can no longer change. The signed-off record itself is
    // not lost: it was written to qa_submission_versions at sign-off time (§29).
    // Same treatment as reopen, which this is a variant of.
    const clearSignoff = stage === 'approver';

    const { rows } = await pool.query(
      `UPDATE qa_submissions
          SET status = 'Sent Back', sent_back_by = $1, sent_back_at = NOW(),
              sent_back_reason = $2, sent_back_stage = $3,
              signoff_snapshot = CASE WHEN $6 THEN NULL ELSE signoff_snapshot END,
              signed_off_by    = CASE WHEN $6 THEN NULL ELSE signed_off_by END,
              signed_off_at    = CASE WHEN $6 THEN NULL ELSE signed_off_at END,
              signoff_comment  = CASE WHEN $6 THEN NULL ELSE signoff_comment END,
              updated_by = $1, updated_at = NOW()
        WHERE id = $4 AND tenant_id = $5 RETURNING *`,
      [userId || null, reason, stage, id, tenantId, clearSignoff],
    );
    await addHistory(
      id,
      tenantId,
      userId,
      'sent_back',
      stage === 'approver' ? 'Approver sent the submission back' : 'Submission sent back to QA',
      reason,
      { stage, from: existing.status },
    );

    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error sending QA submission back:', error);
    fail(res, 500, 'Internal Server Error');
  }
};

/**
 * Reopen a signed-off submission (QA Manager, §32).
 *
 * The sign-off snapshot is left on the record and preserved as a version, so
 * reopening never rewrites what was previously signed off (§33.17).
 */
export const reopenSubmission = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { tenantId, userId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { id } = req.params;
    const reason = String(req.body?.reason ?? '').trim();
    if (!reason) return fail(res, 400, 'A reason is required when reopening a submission.');

    const existing = await loadSubmissionRow(id, tenantId);
    if (!existing) return fail(res, 404, 'QA Submission not found');
    if (existing.status !== 'QA Signed-off' && existing.status !== 'Approved') {
      return fail(res, 409, 'Only a signed-off or approved submission can be reopened.');
    }

    await client.query('BEGIN');

    // The signed-off numbers were already frozen into this version's row at
    // sign-off time, so clearing signoff_snapshot here loses nothing — the
    // historical record stays readable under its version (§33.17).
    const { rows } = await client.query(
      `UPDATE qa_submissions
          SET status = 'Retesting', signoff_snapshot = NULL,
              signed_off_by = NULL, signed_off_at = NULL, signoff_comment = NULL,
              approved_by = NULL, approved_at = NULL, approver_comment = NULL,
              updated_by = $1, updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [userId || null, id, tenantId],
    );

    await addHistory(id, tenantId, userId, 'reopened', 'Submission reopened for further testing', reason, {
      from: existing.status,
      preservedVersion: int(existing.version),
    }, client);

    await client.query('COMMIT');
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error reopening QA submission:', error);
    fail(res, 500, 'Internal Server Error');
  } finally {
    client.release();
  }
};

/** A frozen version's full snapshot (§29). */
export const getSubmissionVersion = async (req: Request, res: Response) => {
  try {
    const { tenantId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { id, version } = req.params;
    const { rows } = await pool.query(
      `SELECT v.*, u.name AS created_by_name
         FROM qa_submission_versions v
         LEFT JOIN users u ON u.id::text = v.created_by::text
        WHERE v.submission_id = $1 AND v.tenant_id = $2 AND v.version = $3`,
      [id, tenantId, int(version)],
    );
    if (!rows.length) return fail(res, 404, 'Version not found');
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error fetching submission version:', error);
    fail(res, 500, 'Internal Server Error');
  }
};

// ─── Known issues (§19) ──────────────────────────────────────────────────────

export const upsertKnownIssue = async (req: Request, res: Response) => {
  try {
    const { tenantId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { id } = req.params;
    const owner = await loadSubmissionRow(id, tenantId);
    if (!owner) return fail(res, 404, 'QA Submission not found');

    const {
      issueId, bug_id, bug_number, severity, current_status,
      business_impact, workaround, expected_resolution, accepted_by, comment, position,
    } = req.body || {};

    const values = [
      bug_id || null,
      bug_number || null,
      severity || null,
      current_status || null,
      business_impact || null,
      workaround || null,
      expected_resolution || null,
      accepted_by || null,
      comment || null,
      int(position),
    ];

    const { rows } = issueId
      ? await pool.query(
          `UPDATE qa_submission_known_issues
              SET bug_id = $1, bug_number = $2, severity = $3, current_status = $4,
                  business_impact = $5, workaround = $6, expected_resolution = $7,
                  accepted_by = $8, comment = $9, position = $10, updated_at = NOW()
            WHERE id = $11 AND submission_id = $12 AND tenant_id = $13
            RETURNING *`,
          [...values, issueId, id, tenantId],
        )
      : await pool.query(
          `INSERT INTO qa_submission_known_issues
             (bug_id, bug_number, severity, current_status, business_impact, workaround,
              expected_resolution, accepted_by, comment, position, submission_id, tenant_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [...values, id, tenantId],
        );

    if (!rows.length) return fail(res, 404, 'Known issue not found');
    res.status(issueId ? 200 : 201).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error saving known issue:', error);
    fail(res, 500, 'Internal Server Error');
  }
};

export const deleteKnownIssue = async (req: Request, res: Response) => {
  try {
    const { tenantId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { id, issueId } = req.params;
    await pool.query(
      `DELETE FROM qa_submission_known_issues WHERE id = $1 AND submission_id = $2 AND tenant_id = $3`,
      [issueId, id, tenantId],
    );
    res.status(200).json({ success: true, message: 'Known issue removed' });
  } catch (error) {
    console.error('Error deleting known issue:', error);
    fail(res, 500, 'Internal Server Error');
  }
};

// ─── Attachments (§20) ───────────────────────────────────────────────────────

const ATTACHMENT_CATEGORIES = ['Test Evidence', 'Screenshots', 'Reports', 'Documents', 'Other'];

export const addAttachment = async (req: Request, res: Response) => {
  try {
    const { tenantId, userId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { id } = req.params;
    const owner = await loadSubmissionRow(id, tenantId);
    if (!owner) return fail(res, 404, 'QA Submission not found');

    const { base64, fileName, url, name, category } = req.body || {};
    const cat = ATTACHMENT_CATEGORIES.includes(category) ? category : 'Other';

    let record: { name: string; url: string; kind: string; fileType: string | null; fileSize: number | null };

    if (base64) {
      const uploaded = await uploadSubmissionAttachmentToR2(base64, fileName || name || 'attachment', tenantId, id);
      record = {
        kind: 'file',
        name: String(name || fileName || 'Attachment').trim(),
        url: uploaded.fileUrl,
        fileType: uploaded.fileType,
        fileSize: uploaded.fileSize,
      };
    } else if (url) {
      const clean = String(url).trim();
      if (!/^https?:\/\//i.test(clean)) {
        return fail(res, 400, 'Link must start with http:// or https://');
      }
      record = { kind: 'link', name: String(name || clean).trim(), url: clean, fileType: null, fileSize: null };
    } else {
      return fail(res, 400, 'Provide a file or a link');
    }

    const { rows } = await pool.query(
      `INSERT INTO qa_submission_attachments
         (tenant_id, submission_id, category, kind, name, url, file_type, file_size, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [tenantId, id, cat, record.kind, record.name, record.url, record.fileType, record.fileSize, userId || null],
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (error: any) {
    console.error('Error adding submission attachment:', error);
    fail(res, 500, error?.message || 'Failed to add the attachment');
  }
};

export const deleteAttachment = async (req: Request, res: Response) => {
  try {
    const { tenantId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { id, attachmentId } = req.params;
    const { rows } = await pool.query(
      `DELETE FROM qa_submission_attachments
        WHERE id = $1 AND submission_id = $2 AND tenant_id = $3
        RETURNING kind, url`,
      [attachmentId, id, tenantId],
    );
    if (!rows.length) return fail(res, 404, 'Attachment not found');

    // Links point at someone else's storage — only clean up files we uploaded.
    if (rows[0].kind === 'file' && rows[0].url) {
      await deleteFileFromR2(rows[0].url, tenantId).catch((e) =>
        console.error('Failed to delete submission attachment from R2:', e),
      );
    }

    res.status(200).json({ success: true, message: 'Attachment removed' });
  } catch (error) {
    console.error('Error deleting submission attachment:', error);
    fail(res, 500, 'Internal Server Error');
  }
};

// ─── AI assistance (§18) ─────────────────────────────────────────────────────

/**
 * Draft a QA Summary from the submission's own numbers ("Create with Zai").
 *
 * Returns the draft for the user to accept — the caller decides whether to keep
 * it. Nothing here writes to qa_summary, so existing content is never
 * overwritten without an explicit user action.
 */
export const generateQaSummary = async (req: Request, res: Response) => {
  try {
    const { tenantId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { id } = req.params;
    const submission = await loadSubmissionRow(id, tenantId);
    if (!submission) return fail(res, 404, 'QA Submission not found');

    const provider = await getAIProviderForTenant(tenantId);
    if (!provider || !provider.isConfigured()) {
      return fail(res, 400, 'AI provider is not configured. Please add an API key in .env or Tenant AI settings.');
    }

    const summary = await buildFullSummary(id, tenantId);
    const e = summary.execution;
    const instruction = String(req.body?.prompt ?? '').trim();

    const prompt = `
You are a QA lead writing the closing summary of a testing cycle for a project manager.

Scope: ${submission.scope_name || 'Unnamed scope'}
Submission: ${submission.submission_name}
Testing runs: ${summary.runs.map((r: any) => `${r.run_name} (${r.run_role})`).join(', ') || 'none'}

Test execution:
- Total cases: ${e.totalCases}
- Executed: ${e.executed}
- Passed: ${e.passed}
- Failed: ${e.failed}
- Blocked: ${e.blocked}
- Not executed: ${e.notExecuted}
- Pass rate: ${e.passRate}%

Defects: ${summary.bugs.total} raised, ${summary.bugs.resolved} resolved, ${summary.bugs.open} open (${summary.bugs.criticalOpen} critical still open).
Development tickets: ${summary.tickets.created} created, ${summary.tickets.resolved} resolved.
Retesting: ${summary.retest.failedInitially} failed initially, ${summary.retest.retested} retested, ${summary.retest.passedAfterRetest} passed after retest, ${summary.retest.stillFailed} still failing.
QA recommendation: ${submission.qa_recommendation || 'not yet chosen'}.
${instruction ? `\nAdditional instruction from the QA engineer: ${instruction}` : ''}

Write 2-4 short paragraphs of plain prose stating what was tested, what the results were, what happened to the defects, and what remains open. Use ONLY the figures above — never invent a number, a defect id or a date. Do not add a heading, a preamble, bullet lists or markdown fences. Return simple HTML paragraphs (<p>...</p>) only.
`.trim();

    const raw = await provider.generateText(prompt, { temperature: 0.4, maxOutputTokens: 1200 });
    const text = (raw?.text || '')
      .replace(/^```[a-zA-Z]*\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    if (!text) return fail(res, 502, 'The AI provider returned an empty summary. Please try again.');

    res.status(200).json({ success: true, data: { text } });
  } catch (error) {
    console.error('Error generating QA summary:', error);
    fail(res, 500, 'Failed to draft the QA summary');
  }
};

/** Light-touch copy edit, matching the run-note Grammar action. */
export const qaSummaryGrammar = async (req: Request, res: Response) => {
  try {
    const { tenantId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');

    const input = String(req.body?.text ?? '').trim();
    if (!input) return fail(res, 400, 'Nothing to polish yet');
    if (input.length > 12000) return fail(res, 400, 'Text is too long (max 12000 characters)');

    const provider = await getAIProviderForTenant(tenantId);
    if (!provider || !provider.isConfigured()) {
      return fail(res, 400, 'AI provider is not configured. Please add an API key in .env or Tenant AI settings.');
    }

    const prompt = `
You are a light-touch copy editor for QA reports. Make ONLY minimal changes:
- Fix spelling, grammar, punctuation, capitalisation, and obvious typos.
- Preserve the author's voice, tone, HTML markup, numbers, IDs and technical terms exactly.
- Do NOT rewrite, summarise, expand, translate, or add anything new.
- Never change a figure, a defect id or a date.
- Do NOT wrap in quotes or markdown. Do NOT add a preamble.
Return ONLY the corrected text.

Text:
${input}
`.trim();

    const raw = await provider.generateText(prompt, { temperature: 0.2, maxOutputTokens: 2048 });
    const corrected = (raw?.text || '')
      .replace(/^```[a-zA-Z]*\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim() || input;

    res.status(200).json({ success: true, data: { text: corrected } });
  } catch (error) {
    console.error('QA summary grammar error:', error);
    fail(res, 500, 'Failed to polish the text');
  }
};
