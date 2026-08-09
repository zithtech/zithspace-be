/**
 * Exercises the §34 reference scenario end-to-end against the real database,
 * inside a transaction that is ROLLED BACK. Nothing is persisted.
 *
 * The point is the "effective result per test case" rule: a scope of 150 cases
 * must stay 150 cases after retest runs are linked, with retested cases
 * reporting their latest outcome rather than being counted twice.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { Pool } = require('pg');

const T = '00000000-0000-0000-0000-0000000000aa';
const SUB = '00000000-0000-0000-0000-0000000000bb';
const SCOPE = '00000000-0000-0000-0000-0000000000cc';
const PARENT = '00000000-0000-0000-0000-0000000000dd';
const SUITE = '00000000-0000-0000-0000-0000000000ee';

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
           trr.test_case_id, trr.status
      FROM qa_test_run_results trr
      JOIN linked l ON l.run_id = trr.test_run_id
     ORDER BY trr.test_case_id,
              (trr.status IS NOT NULL AND trr.status <> 'Not Executed') DESC,
              l.run_time DESC NULLS LAST,
              trr.executed_at DESC NULLS LAST
  )
`;

const EXEC_SQL = `${EFFECTIVE_CTE}
  SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'Pass')::int    AS passed,
         COUNT(*) FILTER (WHERE status = 'Fail')::int    AS failed,
         COUNT(*) FILTER (WHERE status = 'Blocked')::int AS blocked,
         COUNT(*) FILTER (WHERE status IS NULL OR status = 'Not Executed')::int AS not_executed
    FROM effective`;

const RETEST_SQL = `WITH linked AS (
     SELECT sr.run_id, sr.run_role,
            COALESCE(tr.completed_at, tr.started_at, tr.created_at) AS run_time
       FROM qa_submission_runs sr
       JOIN qa_test_runs tr ON tr.id = sr.run_id
      WHERE sr.submission_id = $1 AND sr.tenant_id = $2
   ),
   initial_failed AS (
     SELECT DISTINCT trr.test_case_id
       FROM qa_test_run_results trr JOIN linked l ON l.run_id = trr.test_run_id
      WHERE l.run_role = 'initial' AND trr.status = 'Fail'
   ),
   retest_latest AS (
     SELECT DISTINCT ON (trr.test_case_id) trr.test_case_id, trr.status
       FROM qa_test_run_results trr JOIN linked l ON l.run_id = trr.test_run_id
      WHERE l.run_role = 'retest' AND trr.status IS NOT NULL AND trr.status <> 'Not Executed'
      ORDER BY trr.test_case_id, l.run_time DESC NULLS LAST, trr.executed_at DESC NULLS LAST
   )
   SELECT
     (SELECT COUNT(*) FROM initial_failed)::int AS failed_initially,
     (SELECT COUNT(*) FROM initial_failed f JOIN retest_latest r USING (test_case_id))::int AS retested,
     (SELECT COUNT(*) FROM initial_failed f JOIN retest_latest r USING (test_case_id) WHERE r.status = 'Pass')::int AS passed_after_retest,
     (SELECT COUNT(*) FROM initial_failed f JOIN retest_latest r USING (test_case_id) WHERE r.status = 'Fail')::int AS still_failed`;

let failures = 0;
function expect(label, actual, want) {
  const got = JSON.stringify(actual);
  const exp = JSON.stringify(want);
  const ok = got === exp;
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(42)} ${ok ? got : `got ${got}, expected ${exp}`}`);
}

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // The schema is created inside the same transaction, so the rollback also
    // removes it — this run leaves the database exactly as it found it.
    require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
    const { QA_SUBMISSION_DDL } = require(path.resolve(__dirname, '../db/qaSubmissionSchema.ts'));
    for (const ddl of QA_SUBMISSION_DDL) await c.query(ddl);

    await c.query(`INSERT INTO qa_test_scopes (id, tenant_id, name, status) VALUES ($1,$2,'TODO Module','Approved')`, [SCOPE, T]);
    await c.query(`INSERT INTO qa_parent_test_cases (id, tenant_id, title) VALUES ($1,$2,'TODO scenarios')`, [PARENT, T]);
    await c.query(`INSERT INTO qa_test_suites (id, tenant_id, suite_name, parent_test_case_id) VALUES ($1,$2,'TODO Suite',$3)`, [SUITE, T, PARENT]);

    // 150 test cases
    const caseIds = [];
    for (let i = 1; i <= 150; i++) {
      const { rows } = await c.query(
        `INSERT INTO qa_test_cases (tenant_id, parent_test_case_id, test_case_id, name)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [T, PARENT, `TC-${1000 + i}`, `Case ${i}`],
      );
      caseIds.push(rows[0].id);
    }
    console.log(`seeded 150 test cases`);

    const mkRun = async (name, at) => {
      const { rows } = await c.query(
        `INSERT INTO qa_test_runs (tenant_id, run_name, suite_id, scope_id, started_at, completed_at)
         VALUES ($1,$2,$3,$4,$5::timestamptz,$5::timestamptz) RETURNING id`,
        [T, name, SUITE, SCOPE, at],
      );
      return rows[0].id;
    };
    const addResults = async (runId, ids, status, at) => {
      for (const cid of ids) {
        await c.query(
          `INSERT INTO qa_test_run_results (tenant_id, test_run_id, test_case_id, status, executed_at)
           VALUES ($1,$2,$3,$4,$5::timestamptz)`,
          [T, runId, cid, status, at],
        );
      }
    };

    // Initial testing: Smoke (1-50), Regression (51-120, ten failures), E2E (121-150)
    const smoke = await mkRun('Smoke Testing - Run #124', '2026-08-01T09:00:00Z');
    await addResults(smoke, caseIds.slice(0, 50), 'Pass', '2026-08-01T09:30:00Z');

    const regression = await mkRun('Regression Testing - Run #125', '2026-08-02T09:00:00Z');
    await addResults(regression, caseIds.slice(50, 110), 'Pass', '2026-08-02T09:30:00Z');
    const failedTen = caseIds.slice(110, 120);
    await addResults(regression, failedTen, 'Fail', '2026-08-02T09:40:00Z');

    const e2e = await mkRun('End-to-End Testing - Run #126', '2026-08-03T09:00:00Z');
    await addResults(e2e, caseIds.slice(120, 150), 'Pass', '2026-08-03T09:30:00Z');

    await c.query(
      `INSERT INTO qa_submissions (id, tenant_id, submission_name, scope_id) VALUES ($1,$2,'TODO Module - QA Submission',$3)`,
      [SUB, T, SCOPE],
    );
    const link = (runId, role) =>
      c.query(`INSERT INTO qa_submission_runs (tenant_id, submission_id, run_id, run_role) VALUES ($1,$2,$3,$4)`, [T, SUB, runId, role]);

    await link(smoke, 'initial');
    await link(regression, 'initial');
    await link(e2e, 'initial');

    console.log('\n§34 Initial testing — 150 cases, 140 passed, 10 failed');
    let e = (await c.query(EXEC_SQL, [SUB, T])).rows[0];
    expect('initial execution', e, { total: 150, passed: 140, failed: 10, blocked: 0, not_executed: 0 });

    // Retest run #131 — the ten affected cases: 9 pass, 1 still fails
    const retest1 = await mkRun('Retest Run #131', '2026-08-09T09:00:00Z');
    await addResults(retest1, failedTen.slice(0, 9), 'Pass', '2026-08-09T09:30:00Z');
    await addResults(retest1, failedTen.slice(9), 'Fail', '2026-08-09T09:30:00Z');
    await link(retest1, 'retest');

    console.log('\n§34 After retest #131 — 9 pass, 1 still failing');
    e = (await c.query(EXEC_SQL, [SUB, T])).rows[0];
    expect('execution after first retest', e, { total: 150, passed: 149, failed: 1, blocked: 0, not_executed: 0 });
    let r = (await c.query(RETEST_SQL, [SUB, T])).rows[0];
    expect('retest summary after first retest', r, { failed_initially: 10, retested: 10, passed_after_retest: 9, still_failed: 1 });

    // Retest run #133 — the last case passes
    const retest2 = await mkRun('Retest Run #133', '2026-08-09T15:00:00Z');
    await addResults(retest2, failedTen.slice(9), 'Pass', '2026-08-09T15:30:00Z');
    await link(retest2, 'retest');

    console.log('\n§34 Final retest #133 — 150 passed, 0 failed');
    e = (await c.query(EXEC_SQL, [SUB, T])).rows[0];
    expect('final execution', e, { total: 150, passed: 150, failed: 0, blocked: 0, not_executed: 0 });
    r = (await c.query(RETEST_SQL, [SUB, T])).rows[0];
    expect('final retest summary', r, { failed_initially: 10, retested: 10, passed_after_retest: 10, still_failed: 0 });

    // Regression guard: creating a retest run copies EVERY case in the suite as
    // "Not Executed". That must not blank out results already recorded.
    console.log('\nRegression guard — a fresh retest run seeded with Not Executed rows');
    const fresh = await mkRun('Retest Run #140 (freshly created)', '2026-08-10T09:00:00Z');
    await addResults(fresh, caseIds, 'Not Executed', null);
    await link(fresh, 'retest');
    e = (await c.query(EXEC_SQL, [SUB, T])).rows[0];
    expect('unexecuted retest run does not blank results', e, { total: 150, passed: 150, failed: 0, blocked: 0, not_executed: 0 });

    // ...and once one case is actually re-executed in it, that case updates.
    await c.query(
      `UPDATE qa_test_run_results SET status = 'Fail', executed_at = '2026-08-10T10:00:00Z'
        WHERE test_run_id = $1 AND test_case_id = $2`,
      [fresh, caseIds[0]],
    );
    e = (await c.query(EXEC_SQL, [SUB, T])).rows[0];
    expect('newly executed retest result wins', e, { total: 150, passed: 149, failed: 1, blocked: 0, not_executed: 0 });

    // A case never executed anywhere still reports as Not Executed.
    console.log('\nNot-executed accounting');
    const { rows: extra } = await c.query(
      `INSERT INTO qa_test_cases (tenant_id, parent_test_case_id, test_case_id, name)
       VALUES ($1,$2,'TC-9999','Never executed') RETURNING id`, [T, PARENT],
    );
    await addResults(fresh, [extra[0].id], 'Not Executed', null);
    e = (await c.query(EXEC_SQL, [SUB, T])).rows[0];
    expect('never-executed case counts as Not Executed', e, { total: 151, passed: 149, failed: 1, blocked: 0, not_executed: 1 });
  } catch (err) {
    failures++;
    console.log('UNEXPECTED:', err.message);
  } finally {
    await c.query('ROLLBACK');
    c.release();
    await pool.end();
  }
  console.log(failures === 0 ? '\nALL ASSERTIONS PASSED — transaction rolled back, nothing persisted.' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})();
