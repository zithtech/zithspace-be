import { Request, Response } from 'express';
import pool from '../config/dbpool';
import { ensureQaSubmissionSchema } from '../db/qaSubmissionSchema';

/**
 * QA Space — Reporting & Analytics.
 *
 * Every figure is derived from the execution record (runs → results), the bug
 * list and the submission trail. Nothing is stored or hand-entered, so a report
 * can never disagree with the run it came from.
 *
 * Four dimensions cut the same underlying data:
 *   QA Owner  who executed the run (qa_test_runs.executed_by)
 *   Release   the scope's release plan, or its free-text release version
 *   Scope     the test scope the run belongs to
 *   Run       a single execution
 *
 * A note on counting: these reports intentionally count *executions*, not
 * distinct test cases. A case executed in three runs is three data points here —
 * that is what "how much testing happened" means. QA Submissions deliberately
 * counts the other way (one effective result per case), because it answers
 * "what is the state of this scope". Both are right for their question.
 */

// ─── Vocabulary ──────────────────────────────────────────────────────────────

/** Bug workflow states that still count as unresolved. */
const OPEN_BUGS = `('new','converted','reopened')`;
/** Bugs removed from the list — never counted. */
const DEAD_BUGS = `('trash','archived')`;
/** Severities treated as release-blocking. */
const CRITICAL_SEVERITIES = `('blocker','critical')`;

const auth = (req: Request) => ({
  tenantId: (req as any).user?.tenantId as string | undefined,
});

const fail = (res: Response, code: number, error: string) =>
  res.status(code).json({ success: false, error });

const int = (v: any) => parseInt(String(v ?? 0), 10) || 0;
const num = (v: any) => Number(v ?? 0) || 0;
const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

/**
 * The release a scope belongs to. Scopes record this two ways — a release-plan
 * id chosen from the picker, or a free-text version typed in — so both are
 * folded into one label rather than reporting the same release twice.
 */
const RELEASE_LABEL = `
  COALESCE(
    NULLIF(rp.version, ''),
    NULLIF(sc.details->>'releaseVersion', ''),
    'Unassigned'
  )`;

/** Joins shared by every execution-based query. */
const EXEC_JOINS = `
  FROM qa_test_run_results trr
  JOIN qa_test_runs tr        ON tr.id = trr.test_run_id
  LEFT JOIN qa_test_scopes sc ON sc.id = tr.scope_id
  LEFT JOIN release_plans rp  ON rp.id::text = sc.details->>'sprint'
  LEFT JOIN users u           ON u.id::text = tr.executed_by::text
  LEFT JOIN qa_test_suites ts ON ts.id = tr.suite_id
`;

/** When a result counts as having happened, for date filtering and trends. */
const EXEC_AT = `COALESCE(trr.executed_at, tr.completed_at, tr.started_at, tr.created_at)`;

type Filters = {
  where: string;
  params: any[];
};

/**
 * Turns the shared query string into SQL. Every report takes the same filter
 * set so a number can be traced from one tab to the next without the basis
 * quietly changing underneath.
 */
function buildFilters(req: Request, tenantId: string): Filters {
  const params: any[] = [tenantId];
  let where = 'trr.tenant_id = $1';

  const add = (clause: string, value: any) => {
    params.push(value);
    where += ` AND ${clause.replace(/\$\$/g, `$${params.length}`)}`;
  };

  const from = String(req.query.from ?? '').trim();
  const to = String(req.query.to ?? '').trim();
  const ownerId = String(req.query.ownerId ?? '').trim();
  const release = String(req.query.release ?? '').trim();
  const scopeId = String(req.query.scopeId ?? '').trim();
  const runId = String(req.query.runId ?? '').trim();

  if (from) add(`${EXEC_AT} >= $$::timestamptz`, from);
  if (to) add(`${EXEC_AT} < ($$::timestamptz + INTERVAL '1 day')`, to);
  if (ownerId) add(`tr.executed_by::text = $$`, ownerId);
  if (release) add(`${RELEASE_LABEL} = $$`, release);
  if (scopeId) add(`tr.scope_id = $$::uuid`, scopeId);
  if (runId) add(`tr.id = $$::uuid`, runId);

  return { where, params };
}

/** Outcome tallies, written once — every breakdown reports the same columns. */
const OUTCOME_COLUMNS = `
  COUNT(*)::int                                                              AS total,
  COUNT(*) FILTER (WHERE trr.status = 'Pass')::int                           AS passed,
  COUNT(*) FILTER (WHERE trr.status = 'Fail')::int                           AS failed,
  COUNT(*) FILTER (WHERE trr.status = 'Blocked')::int                        AS blocked,
  COUNT(*) FILTER (WHERE trr.status IS NULL OR trr.status = 'Not Executed')::int AS not_executed,
  COUNT(DISTINCT tr.id)::int                                                 AS runs,
  COUNT(DISTINCT trr.test_case_id)::int                                      AS cases,
  COUNT(trr.bug_id) FILTER (WHERE trr.bug_id IS NOT NULL)::int               AS bugs_linked
`;

/** Adds the derived rates every row carries, so the client never recomputes. */
function shapeOutcome(r: any) {
  const total = int(r.total);
  const notExecuted = int(r.not_executed);
  const executed = total - notExecuted;
  const passed = int(r.passed);
  return {
    ...r,
    total,
    passed,
    failed: int(r.failed),
    blocked: int(r.blocked),
    not_executed: notExecuted,
    executed,
    runs: int(r.runs),
    cases: int(r.cases),
    bugs_linked: int(r.bugs_linked),
    pass_rate: pct(passed, executed),
    execution_rate: pct(executed, total),
  };
}

// ─── Filter options ──────────────────────────────────────────────────────────

/** Populates the filter bar from what actually has execution data. */
export const getFilterOptions = async (req: Request, res: Response) => {
  try {
    const { tenantId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const [owners, releases, scopes, runs] = await Promise.all([
      pool.query(
        `SELECT DISTINCT tr.executed_by::text AS id, COALESCE(u.name, 'Unassigned') AS label
           FROM qa_test_runs tr
           LEFT JOIN users u ON u.id::text = tr.executed_by::text
          WHERE tr.tenant_id = $1 AND tr.executed_by IS NOT NULL
          ORDER BY label ASC`,
        [tenantId],
      ),
      pool.query(
        `SELECT DISTINCT ${RELEASE_LABEL} AS label
           FROM qa_test_scopes sc
           LEFT JOIN release_plans rp ON rp.id::text = sc.details->>'sprint'
          WHERE sc.tenant_id = $1
          ORDER BY label ASC`,
        [tenantId],
      ),
      pool.query(
        `SELECT id, name AS label, status, qa_owner
           FROM qa_test_scopes WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [tenantId],
      ),
      pool.query(
        `SELECT id, run_name AS label FROM qa_test_runs
          WHERE tenant_id = $1 ORDER BY COALESCE(completed_at, started_at, created_at) DESC LIMIT 300`,
        [tenantId],
      ),
    ]);

    res.status(200).json({
      success: true,
      data: {
        owners: owners.rows,
        releases: releases.rows.map((r: any) => r.label).filter(Boolean),
        scopes: scopes.rows,
        runs: runs.rows,
      },
    });
  } catch (error) {
    console.error('Error fetching QA analytics filters:', error);
    fail(res, 500, 'Internal Server Error');
  }
};

// ─── Overview ────────────────────────────────────────────────────────────────

/** Headline KPIs plus the outcome split the whole report hangs off. */
export const getOverview = async (req: Request, res: Response) => {
  try {
    const { tenantId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { where, params } = buildFilters(req, tenantId);

    const [exec, defects, scopeAgg, submissionAgg] = await Promise.all([
      pool.query(`SELECT ${OUTCOME_COLUMNS} ${EXEC_JOINS} WHERE ${where}`, params),

      // Defects reached through the executions in scope, so the bug numbers
      // move with the filters instead of always reporting the whole bug list.
      pool.query(
        `WITH ids AS (
           SELECT DISTINCT trr.bug_id ${EXEC_JOINS} WHERE ${where} AND trr.bug_id IS NOT NULL
         )
         SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE b.status IN ${OPEN_BUGS})::int AS open,
                COUNT(*) FILTER (WHERE b.status = 'verified')::int    AS resolved,
                COUNT(*) FILTER (WHERE b.status = 'reopened')::int    AS reopened,
                COUNT(*) FILTER (WHERE LOWER(b.severity) IN ${CRITICAL_SEVERITIES})::int AS critical,
                COUNT(*) FILTER (WHERE LOWER(b.severity) IN ${CRITICAL_SEVERITIES}
                                   AND b.status IN ${OPEN_BUGS})::int AS critical_open,
                COUNT(DISTINCT b.ticket_id) FILTER (WHERE b.ticket_id IS NOT NULL)::int AS tickets
           FROM ids
           JOIN bugs b ON b.id::text = ids.bug_id
                      AND b.tenant_id = $1::text
                      AND b.status NOT IN ${DEAD_BUGS}`,
        params,
      ),

      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'Approved')::int AS approved,
                COUNT(*) FILTER (WHERE status NOT IN ('Approved','Rejected'))::int AS active
           FROM qa_test_scopes WHERE tenant_id = $1`,
        [tenantId],
      ),

      // Cycle time is measured on signed-off submissions only — an unfinished
      // one has no end point and would drag the average toward zero.
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'QA Signed-off')::int AS awaiting_approval,
                COUNT(*) FILTER (WHERE status = 'Approved')::int      AS approved,
                COUNT(*) FILTER (WHERE status = 'Sent Back')::int     AS sent_back,
                COUNT(*) FILTER (WHERE version > 1)::int              AS resubmitted,
                AVG(EXTRACT(EPOCH FROM (signed_off_at - created_at)) / 86400.0)
                  FILTER (WHERE signed_off_at IS NOT NULL)            AS avg_days_to_signoff
           FROM qa_submissions WHERE tenant_id = $1`,
        [tenantId],
      ),
    ]);

    const e = shapeOutcome(exec.rows[0] || {});
    const d = defects.rows[0] || {};
    const s = scopeAgg.rows[0] || {};
    const sub = submissionAgg.rows[0] || {};

    const totalBugs = int(d.total);
    const submissions = int(sub.total);

    res.status(200).json({
      success: true,
      data: {
        execution: e,
        defects: {
          total: totalBugs,
          open: int(d.open),
          resolved: int(d.resolved),
          reopened: int(d.reopened),
          critical: int(d.critical),
          criticalOpen: int(d.critical_open),
          tickets: int(d.tickets),
          // Defects per 100 executed cases — comparable across scopes of
          // different sizes, which a raw bug count is not.
          density: e.executed > 0 ? Math.round((totalBugs / e.executed) * 1000) / 10 : 0,
          reopenRate: pct(int(d.reopened), totalBugs),
          ticketConversion: pct(int(d.tickets), totalBugs),
        },
        scopes: {
          total: int(s.total),
          approved: int(s.approved),
          active: int(s.active),
        },
        submissions: {
          total: submissions,
          awaitingApproval: int(sub.awaiting_approval),
          approved: int(sub.approved),
          sentBack: int(sub.sent_back),
          // How often a submission needed a second pass — the clearest single
          // measure of rework in the QA cycle.
          reworkRate: pct(int(sub.resubmitted), submissions),
          avgDaysToSignoff: sub.avg_days_to_signoff
            ? Math.round(num(sub.avg_days_to_signoff) * 10) / 10
            : null,
        },
      },
    });
  } catch (error) {
    console.error('Error building QA analytics overview:', error);
    fail(res, 500, 'Internal Server Error');
  }
};

// ─── Trends ──────────────────────────────────────────────────────────────────

/** Execution volume, pass rate and defect flow over time. */
export const getTrends = async (req: Request, res: Response) => {
  try {
    const { tenantId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const granularity = ['day', 'week', 'month'].includes(String(req.query.granularity))
      ? String(req.query.granularity)
      : 'week';

    const { where, params } = buildFilters(req, tenantId);

    const [execRows, bugRows] = await Promise.all([
      pool.query(
        `SELECT DATE_TRUNC('${granularity}', ${EXEC_AT}) AS bucket, ${OUTCOME_COLUMNS}
           ${EXEC_JOINS}
          WHERE ${where} AND ${EXEC_AT} IS NOT NULL
          GROUP BY bucket ORDER BY bucket ASC`,
        params,
      ),
      // Found vs resolved on the same buckets. Two independent dates, so they
      // are counted separately and stitched together rather than joined.
      pool.query(
        `WITH ids AS (
           SELECT DISTINCT trr.bug_id ${EXEC_JOINS} WHERE ${where} AND trr.bug_id IS NOT NULL
         ),
         scoped AS (
           SELECT b.created_at, b.updated_at, b.status
             FROM ids JOIN bugs b ON b.id::text = ids.bug_id
                                 AND b.tenant_id = $1::text
                                 AND b.status NOT IN ${DEAD_BUGS}
         )
         SELECT bucket, SUM(found)::int AS found, SUM(resolved)::int AS resolved FROM (
           SELECT DATE_TRUNC('${granularity}', created_at) AS bucket, 1 AS found, 0 AS resolved FROM scoped
           UNION ALL
           SELECT DATE_TRUNC('${granularity}', updated_at) AS bucket, 0, 1 FROM scoped WHERE status = 'verified'
         ) t
         WHERE bucket IS NOT NULL
         GROUP BY bucket ORDER BY bucket ASC`,
        params,
      ),
    ]);

    const bugByBucket = new Map(
      bugRows.rows.map((r: any) => [new Date(r.bucket).toISOString(), r]),
    );

    const data = execRows.rows.map((r: any) => {
      const shaped = shapeOutcome(r);
      const key = new Date(r.bucket).toISOString();
      const bugs = bugByBucket.get(key) || {};
      return {
        bucket: key,
        ...shaped,
        bugsFound: int((bugs as any).found),
        bugsResolved: int((bugs as any).resolved),
      };
    });

    res.status(200).json({ success: true, data, granularity });
  } catch (error) {
    console.error('Error building QA analytics trends:', error);
    fail(res, 500, 'Internal Server Error');
  }
};

// ─── Breakdowns ──────────────────────────────────────────────────────────────

/** The four dimensions the report can be sliced by. */
const DIMENSIONS: Record<string, { key: string; label: string; extra?: string }> = {
  owner: {
    key: `COALESCE(tr.executed_by::text, 'unassigned')`,
    label: `COALESCE(u.name, 'Unassigned')`,
  },
  release: { key: RELEASE_LABEL, label: RELEASE_LABEL },
  scope: {
    key: `COALESCE(tr.scope_id::text, 'unassigned')`,
    label: `COALESCE(sc.name, 'No scope')`,
    extra: `MAX(sc.status) AS scope_status, MAX(sc.qa_owner) AS scope_owner,
            MAX(sc.end_date::text) AS end_date`,
  },
  run: {
    key: `tr.id::text`,
    label: `tr.run_name`,
    extra: `MAX(ts.suite_name) AS suite_name, MAX(sc.name) AS scope_name,
            MAX(COALESCE(tr.completed_at, tr.started_at)::text) AS ran_at,
            MAX(u.name) AS executed_by`,
  },
};

export const getBreakdown = async (req: Request, res: Response) => {
  try {
    const { tenantId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const by = String(req.query.by ?? 'owner');
    const dim = DIMENSIONS[by];
    if (!dim) return fail(res, 400, `Unknown breakdown "${by}"`);

    const limit = Math.min(Math.max(int(req.query.limit) || 50, 1), 200);
    const { where, params } = buildFilters(req, tenantId);

    const { rows } = await pool.query(
      `SELECT ${dim.key} AS key, ${dim.label} AS label,
              ${dim.extra ? `${dim.extra},` : ''}
              ${OUTCOME_COLUMNS}
         ${EXEC_JOINS}
        WHERE ${where}
        GROUP BY ${dim.key}, ${dim.label}
        ORDER BY total DESC
        LIMIT ${limit}`,
      params,
    );

    res.status(200).json({ success: true, data: rows.map(shapeOutcome), by });
  } catch (error) {
    console.error('Error building QA analytics breakdown:', error);
    fail(res, 500, 'Internal Server Error');
  }
};

// ─── Defects ─────────────────────────────────────────────────────────────────

export const getDefectAnalytics = async (req: Request, res: Response) => {
  try {
    const { tenantId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { where, params } = buildFilters(req, tenantId);
    const scoped = `
      WITH ids AS (
        SELECT DISTINCT trr.bug_id ${EXEC_JOINS} WHERE ${where} AND trr.bug_id IS NOT NULL
      ),
      scoped AS (
        SELECT b.* FROM ids
          JOIN bugs b ON b.id::text = ids.bug_id
                     AND b.tenant_id = $1::text
                     AND b.status NOT IN ${DEAD_BUGS}
      )`;

    const [severity, status, modules, ageing] = await Promise.all([
      pool.query(
        `${scoped}
         SELECT COALESCE(NULLIF(LOWER(severity), ''), 'unspecified') AS key,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status IN ${OPEN_BUGS})::int AS open
           FROM scoped GROUP BY key ORDER BY total DESC`,
        params,
      ),
      pool.query(
        `${scoped}
         SELECT COALESCE(NULLIF(status, ''), 'unknown') AS key, COUNT(*)::int AS total
           FROM scoped GROUP BY key ORDER BY total DESC`,
        params,
      ),
      pool.query(
        `${scoped}
         SELECT COALESCE(NULLIF(module, ''), 'Unspecified') AS key,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status IN ${OPEN_BUGS})::int AS open,
                COUNT(*) FILTER (WHERE LOWER(severity) IN ${CRITICAL_SEVERITIES})::int AS critical
           FROM scoped GROUP BY key ORDER BY total DESC LIMIT 12`,
        params,
      ),
      // How long open defects have been sitting — the signal a raw open count
      // hides, since ten fresh bugs and ten month-old ones read the same.
      pool.query(
        `${scoped}
         SELECT
           COUNT(*) FILTER (WHERE age_days <= 2)::int                     AS d0_2,
           COUNT(*) FILTER (WHERE age_days > 2 AND age_days <= 7)::int    AS d3_7,
           COUNT(*) FILTER (WHERE age_days > 7 AND age_days <= 30)::int   AS d8_30,
           COUNT(*) FILTER (WHERE age_days > 30)::int                     AS d30_plus,
           ROUND(AVG(age_days)::numeric, 1)                               AS avg_age_days
         FROM (
           SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0 AS age_days
             FROM scoped WHERE status IN ${OPEN_BUGS}
         ) a`,
        params,
      ),
    ]);

    res.status(200).json({
      success: true,
      data: {
        bySeverity: severity.rows.map((r: any) => ({ ...r, total: int(r.total), open: int(r.open) })),
        byStatus: status.rows.map((r: any) => ({ ...r, total: int(r.total) })),
        byModule: modules.rows.map((r: any) => ({
          ...r, total: int(r.total), open: int(r.open), critical: int(r.critical),
        })),
        ageing: {
          d0_2: int(ageing.rows[0]?.d0_2),
          d3_7: int(ageing.rows[0]?.d3_7),
          d8_30: int(ageing.rows[0]?.d8_30),
          d30_plus: int(ageing.rows[0]?.d30_plus),
          avgAgeDays: ageing.rows[0]?.avg_age_days ? num(ageing.rows[0].avg_age_days) : 0,
        },
      },
    });
  } catch (error) {
    console.error('Error building QA defect analytics:', error);
    fail(res, 500, 'Internal Server Error');
  }
};

// ─── Coverage ────────────────────────────────────────────────────────────────

/**
 * What the test estate looks like, and where it is thin.
 *
 * Scoped by tenant rather than by the execution filters: a coverage gap is a
 * case that has *never* been run, so filtering by run would define the gap out
 * of existence.
 */
export const getCoverage = async (req: Request, res: Response) => {
  try {
    const { tenantId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');

    const [automation, testType, priority, gaps] = await Promise.all([
      pool.query(
        `SELECT COALESCE(NULLIF(automation, ''), 'Unspecified') AS key, COUNT(*)::int AS total
           FROM qa_test_cases WHERE tenant_id = $1 GROUP BY key ORDER BY total DESC`,
        [tenantId],
      ),
      pool.query(
        `SELECT COALESCE(NULLIF(test_type, ''), 'Unspecified') AS key, COUNT(*)::int AS total
           FROM qa_test_cases WHERE tenant_id = $1 GROUP BY key ORDER BY total DESC LIMIT 12`,
        [tenantId],
      ),
      pool.query(
        `SELECT COALESCE(NULLIF(priority, ''), 'Unspecified') AS key, COUNT(*)::int AS total
           FROM qa_test_cases WHERE tenant_id = $1 GROUP BY key ORDER BY total DESC`,
        [tenantId],
      ),
      pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM qa_test_cases WHERE tenant_id = $1) AS total_cases,
           (SELECT COUNT(*)::int FROM qa_test_cases tc
             WHERE tc.tenant_id = $1
               AND NOT EXISTS (SELECT 1 FROM qa_test_run_results r WHERE r.test_case_id = tc.id))
             AS never_run,
           (SELECT COUNT(*)::int FROM qa_test_cases tc
             WHERE tc.tenant_id = $1
               AND NOT EXISTS (SELECT 1 FROM qa_test_suite_cases sc WHERE sc.test_case_id = tc.id))
             AS not_in_suite,
           (SELECT COUNT(*)::int FROM qa_test_suites s
             WHERE s.tenant_id = $1
               AND NOT EXISTS (SELECT 1 FROM qa_test_runs r WHERE r.suite_id = s.id))
             AS suites_never_run,
           (SELECT COUNT(*)::int FROM qa_test_runs r
             WHERE r.tenant_id = $1 AND r.scope_id IS NULL) AS runs_without_scope`,
        [tenantId],
      ),
    ]);

    const g = gaps.rows[0] || {};
    const totalCases = int(g.total_cases);
    const neverRun = int(g.never_run);

    res.status(200).json({
      success: true,
      data: {
        byAutomation: automation.rows.map((r: any) => ({ ...r, total: int(r.total) })),
        byTestType: testType.rows.map((r: any) => ({ ...r, total: int(r.total) })),
        byPriority: priority.rows.map((r: any) => ({ ...r, total: int(r.total) })),
        gaps: {
          totalCases,
          neverRun,
          coverage: pct(totalCases - neverRun, totalCases),
          notInSuite: int(g.not_in_suite),
          suitesNeverRun: int(g.suites_never_run),
          runsWithoutScope: int(g.runs_without_scope),
        },
      },
    });
  } catch (error) {
    console.error('Error building QA coverage analytics:', error);
    fail(res, 500, 'Internal Server Error');
  }
};

// ─── Quality signals ─────────────────────────────────────────────────────────

/**
 * The measures that say whether testing is going *well*, as opposed to how much
 * of it happened.
 */
export const getQualitySignals = async (req: Request, res: Response) => {
  try {
    const { tenantId } = auth(req);
    if (!tenantId) return fail(res, 401, 'Unauthorized');
    await ensureQaSubmissionSchema();

    const { where, params } = buildFilters(req, tenantId);

    const [firstPass, flaky, atRisk] = await Promise.all([
      // First-pass yield: of the cases executed in this window, how many passed
      // on their first attempt and never needed a retest.
      pool.query(
        `WITH ordered AS (
           SELECT trr.test_case_id, trr.status,
                  ROW_NUMBER() OVER (PARTITION BY trr.test_case_id ORDER BY ${EXEC_AT} ASC) AS attempt
             ${EXEC_JOINS}
            WHERE ${where} AND trr.status IS NOT NULL AND trr.status <> 'Not Executed'
         )
         SELECT COUNT(*) FILTER (WHERE attempt = 1)::int                          AS first_attempts,
                COUNT(*) FILTER (WHERE attempt = 1 AND status = 'Pass')::int      AS first_pass,
                COUNT(DISTINCT test_case_id) FILTER (WHERE attempt > 1)::int      AS retried
           FROM ordered`,
        params,
      ),

      // Cases that have both passed and failed across runs. Either the case is
      // unreliable or the feature is — both are worth a QA lead's attention,
      // and neither shows up in a pass-rate average.
      pool.query(
        `WITH per_case AS (
           SELECT trr.test_case_id,
                  COUNT(*) FILTER (WHERE trr.status = 'Pass')::int AS passes,
                  COUNT(*) FILTER (WHERE trr.status = 'Fail')::int AS fails,
                  COUNT(*)::int AS attempts
             ${EXEC_JOINS}
            WHERE ${where} AND trr.status IN ('Pass','Fail')
            GROUP BY trr.test_case_id
         )
         SELECT pc.test_case_id, tc.test_case_id AS case_ref, tc.name AS case_name,
                pc.passes, pc.fails, pc.attempts
           FROM per_case pc
           JOIN qa_test_cases tc ON tc.id = pc.test_case_id
          WHERE pc.passes > 0 AND pc.fails > 0
          ORDER BY pc.fails DESC, pc.attempts DESC
          LIMIT 15`,
        params,
      ),

      // Scopes past their planned end date with testing still outstanding.
      pool.query(
        `SELECT sc.id, sc.name, sc.status, sc.qa_owner, sc.end_date,
                COALESCE(x.total, 0)::int AS total,
                COALESCE(x.executed, 0)::int AS executed
           FROM qa_test_scopes sc
           LEFT JOIN LATERAL (
             SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE r.status IS NOT NULL AND r.status <> 'Not Executed')::int AS executed
               FROM qa_test_runs run
               JOIN qa_test_run_results r ON r.test_run_id = run.id
              WHERE run.scope_id = sc.id
           ) x ON TRUE
          WHERE sc.tenant_id = $1
            AND sc.end_date IS NOT NULL
            AND sc.end_date < CURRENT_DATE
            AND sc.status NOT IN ('Approved', 'Completed', 'Closed')
            AND COALESCE(x.executed, 0) < COALESCE(x.total, 0)
          ORDER BY sc.end_date ASC
          LIMIT 15`,
        [tenantId],
      ),
    ]);

    const fp = firstPass.rows[0] || {};
    const firstAttempts = int(fp.first_attempts);

    res.status(200).json({
      success: true,
      data: {
        firstPassYield: {
          attempts: firstAttempts,
          passed: int(fp.first_pass),
          rate: pct(int(fp.first_pass), firstAttempts),
          retried: int(fp.retried),
        },
        flakyCases: flaky.rows.map((r: any) => ({
          ...r, passes: int(r.passes), fails: int(r.fails), attempts: int(r.attempts),
        })),
        scopesAtRisk: atRisk.rows.map((r: any) => {
          const total = int(r.total);
          const executed = int(r.executed);
          return {
            ...r,
            total,
            executed,
            progress: pct(executed, total),
            daysOverdue: r.end_date
              ? Math.max(0, Math.round((Date.now() - new Date(r.end_date).getTime()) / 86400000))
              : 0,
          };
        }),
      },
    });
  } catch (error) {
    console.error('Error building QA quality signals:', error);
    fail(res, 500, 'Internal Server Error');
  }
};
