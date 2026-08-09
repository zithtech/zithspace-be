import { Request, Response } from 'express';
import pool from '../config/dbpool';

let runScopeColumnReady = false;
/**
 * Adds qa_test_runs.scope_id on first use, so no manual migration is needed —
 * same pattern as the attachments and bug_id columns below. The column is what
 * ties a run to the Test Scope a QA Submission reports on.
 */
const ensureRunScopeColumn = async () => {
  if (runScopeColumnReady) return;
  try {
    await pool.query(`ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS scope_id UUID`);
    runScopeColumnReady = true;
  } catch (e) {
    console.error('Failed to ensure scope_id column:', e);
  }
};

export const getTestRuns = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { suite_id, scope_id, search, limit } = req.query;

    await ensureRunScopeColumn();

    let query = `
      SELECT tr.*, ts.suite_name as suite_name, sc.name as scope_name,
      (SELECT COUNT(*) FROM qa_test_run_results trr WHERE trr.test_run_id = tr.id AND trr.status = 'Pass') as passed_count,
      (SELECT COUNT(*) FROM qa_test_run_results trr WHERE trr.test_run_id = tr.id AND trr.status = 'Fail') as failed_count,
      (SELECT COUNT(*) FROM qa_test_run_results trr WHERE trr.test_run_id = tr.id AND trr.status = 'Blocked') as blocked_count,
      (SELECT COUNT(*) FROM qa_test_run_results trr WHERE trr.test_run_id = tr.id AND trr.status = 'Not Executed') as not_executed_count,
      (SELECT COUNT(*) FROM qa_test_run_results trr WHERE trr.test_run_id = tr.id) as total_cases
      FROM qa_test_runs tr
      LEFT JOIN qa_test_suites ts ON tr.suite_id = ts.id
      LEFT JOIN qa_test_scopes sc ON tr.scope_id = sc.id
      WHERE tr.tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (suite_id) {
      params.push(suite_id);
      query += ` AND tr.suite_id = $${params.length}`;
    }
    if (scope_id) {
      params.push(scope_id);
      query += ` AND tr.scope_id = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND tr.run_name ILIKE $${params.length}`;
    }
    
    query += ` ORDER BY tr.created_at DESC`;
    if (limit) {
      params.push(parseInt(limit as string, 10));
      query += ` LIMIT $${params.length}`;
    }

    const { rows } = await pool.query(query, params);
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching test runs:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const getTestRun = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.params;
    
    // Resolve the project through suite → scenario so bugs raised from this run
    // can be filed against the right project's bug list.
    await pool.query(`ALTER TABLE qa_parent_test_cases ADD COLUMN IF NOT EXISTS project_id TEXT`).catch(() => {});
    await ensureRunScopeColumn();
    const { rows: runRows } = await pool.query(`
      SELECT tr.*, ts.suite_name, ptc.project_id, ptc.title AS scenario_title, u.name as created_by_name,
             sc.name AS scope_name
      FROM qa_test_runs tr
      LEFT JOIN qa_test_suites ts ON tr.suite_id = ts.id
      LEFT JOIN qa_test_scopes sc ON tr.scope_id = sc.id
      LEFT JOIN qa_parent_test_cases ptc ON ts.parent_test_case_id::text = ptc.id::text
      LEFT JOIN users u ON tr.executed_by::text = u.id::text
      WHERE tr.id = $1 AND tr.tenant_id = $2
    `, [id, tenantId]);
    if (!runRows.length) return res.status(404).json({ success: false, error: 'Test Run not found' });
    
    const run = runRows[0];

    // The execution list is paginated server-side — a long suite would
    // otherwise ship hundreds of case definitions on every load.
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const rawSize = parseInt(String(req.query.pageSize ?? '10'), 10) || 10;
    const pageSize = Math.min(Math.max(rawSize, 1), 500);
    const search = String(req.query.search ?? '').trim();
    const status = String(req.query.status ?? '').trim();

    await ensureAttachmentsColumn();
    const hasBugs = await ensureBugLinkColumn();

    // Counts cover the whole run, not the current page, so the stat tiles and
    // the progress bar don't change as the tester pages through.
    const { rows: countRows } = await pool.query(`
      SELECT COUNT(*)::int AS total,
             (COUNT(*) FILTER (WHERE trr.status = 'Pass'))::int AS pass,
             (COUNT(*) FILTER (WHERE trr.status = 'Fail'))::int AS fail,
             (COUNT(*) FILTER (WHERE trr.status = 'Blocked'))::int AS blocked,
             ${hasBugs
               // Failures still missing a live bug — what "Add to Buglist" can act on
               ? `(COUNT(*) FILTER (WHERE trr.status = 'Fail' AND NOT EXISTS (
                     SELECT 1 FROM bugs b
                     WHERE b.id = trr.bug_id AND b.tenant_id = trr.tenant_id::text AND b.status <> 'trash'
                   )))::int`
               : `(COUNT(*) FILTER (WHERE trr.status = 'Fail'))::int`} AS fail_unfiled
      FROM qa_test_run_results trr
      WHERE trr.test_run_id = $1 AND trr.tenant_id = $2
    `, [id, tenantId]);
    const counts = countRows[0] || { total: 0, pass: 0, fail: 0, blocked: 0 };

    const params: any[] = [id, tenantId];
    let where = `WHERE trr.test_run_id = $1 AND trr.tenant_id = $2`;

    if (search) {
      params.push(`%${search}%`);
      const p = `$${params.length}`;
      where += ` AND (tc.name ILIKE ${p} OR tc.test_case_id ILIKE ${p}
                      OR tc.test_type ILIKE ${p} OR trr.notes ILIKE ${p})`;
    }
    if (status === 'pending') {
      where += ` AND (trr.status IS NULL OR trr.status = 'Not Executed')`;
    } else if (status) {
      params.push(status);
      where += ` AND trr.status = $${params.length}`;
    }

    // Include the full case definition so the execution page can show details
    // (description, preconditions, steps, expected result) without a second call.
    // COUNT(*) OVER() gives the filtered total in the same round trip.
    params.push(pageSize, (page - 1) * pageSize);
    const { rows: resultRows } = await pool.query(`
      SELECT trr.*, tc.test_case_id as tc_ref_id, tc.name, tc.priority, tc.test_type,
             tc.severity, tc.automation, tc.status as case_status,
             tc.description, tc.preconditions, tc.steps_to_reproduce, tc.expected_result,
             ${hasBugs ? `b.bug_number, b.sheet_id AS bug_sheet_id, (b.id IS NOT NULL) AS bug_logged,`
                       : `NULL::text AS bug_number, NULL::text AS bug_sheet_id, FALSE AS bug_logged,`}
             (COUNT(*) OVER())::int AS filtered_total
      FROM qa_test_run_results trr
      JOIN qa_test_cases tc ON trr.test_case_id = tc.id
      ${hasBugs
        // A trashed or deleted bug releases the case to be filed again
        ? `LEFT JOIN bugs b
             ON b.id = trr.bug_id AND b.tenant_id = trr.tenant_id::text AND b.status <> 'trash'`
        : ``}
      ${where}
      ORDER BY tc.test_case_id ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const filteredTotal = resultRows.length ? resultRows[0].filtered_total : 0;
    run.results = resultRows.map(({ filtered_total, ...r }: any) => r);
    run.counts = counts;
    run.pagination = {
      page,
      pageSize,
      total: filteredTotal,
      totalPages: Math.max(1, Math.ceil(filteredTotal / pageSize)),
    };

    res.status(200).json({ success: true, data: run });
  } catch (error) {
    console.error('Error fetching test run:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const createTestRun = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    
    const { run_name, suite_id, execution_type, scope_id } = req.body;

    // A run belongs to a scope: it's what lets a QA Submission report the run as
    // testing evidence for that scope. Required on creation — runs that predate
    // the column stay usable and are offered to submissions as unattributed.
    await ensureRunScopeColumn();

    if (!scope_id) {
      return res.status(400).json({ success: false, error: 'Test Scope is required' });
    }

    // The id arrives from the client, so confirm it is this tenant's scope
    // rather than trusting it into the row.
    const { rows: scopeRows } = await client.query(
      `SELECT id FROM qa_test_scopes WHERE id = $1 AND tenant_id = $2`,
      [scope_id, tenantId]
    );
    if (!scopeRows.length) {
      return res.status(404).json({ success: false, error: 'Test Scope not found' });
    }

    await client.query('BEGIN');

    // Create Run
    const { rows: runRows } = await client.query(
      `INSERT INTO qa_test_runs (tenant_id, run_name, suite_id, execution_type, scope_id, executed_by, started_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
      [tenantId, run_name, suite_id, execution_type || null, scope_id || null, userId]
    );
    const runId = runRows[0].id;
    
    // Copy test cases from suite to run results
    await client.query(
      `INSERT INTO qa_test_run_results (tenant_id, test_run_id, test_case_id)
       SELECT $1, $2, test_case_id FROM qa_test_suite_cases
       WHERE test_suite_id = $3 AND tenant_id = $1`,
      [tenantId, runId, suite_id]
    );
    
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: runRows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating test run:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  } finally {
    client.release();
  }
};

export const updateTestRunResult = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    
    const { runId, resultId } = req.params;
    const { status, notes } = req.body;

    // COALESCE so a status-only update keeps the existing note, and a
    // note-only update keeps the existing status.
    const { rows } = await pool.query(
      `UPDATE qa_test_run_results SET
        status = COALESCE($1, status),
        notes = COALESCE($2, notes),
        executed_at = NOW(), updated_at = NOW()
       WHERE id = $3 AND test_run_id = $4 AND tenant_id = $5 RETURNING *`,
      [status ?? null, notes ?? null, resultId, runId, tenantId]
    );
    
    if (!rows.length) return res.status(404).json({ success: false, error: 'Result not found' });
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error updating test run result:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const deleteTestRun = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.params;
    
    await pool.query(`DELETE FROM qa_test_runs WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    res.status(200).json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting test run:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

import { getAIProviderForTenant } from '../services/ai/resolver';

/**
 * Light-touch copy edit for a run result's "What happened" note.
 * Testers write these fast while executing — this fixes typos without
 * rewriting what they observed.
 */
export const runNoteGrammar = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { text } = req.body || {};
    const input = (text || '').trim();
    if (!input) return res.status(400).json({ success: false, error: 'Nothing to polish yet' });
    if (input.length > 4000) return res.status(400).json({ success: false, error: 'Note is too long (max 4000 characters)' });

    const provider = await getAIProviderForTenant(tenantId);
    if (!provider || !provider.isConfigured()) {
      return res.status(400).json({ success: false, error: 'AI provider is not configured. Please add an API key in .env or Tenant AI settings.' });
    }

    const prompt = `
You are a light-touch copy editor for QA defect notes. Make ONLY minimal changes:
- Fix spelling, grammar, punctuation, capitalisation, and obvious typos.
- Preserve the author's voice, tone, line breaks, error messages, IDs and technical terms exactly.
- Do NOT rewrite, summarise, expand, translate, speculate on causes, or add anything new.
- Do NOT wrap in quotes or markdown. Do NOT add a preamble.
Return ONLY the corrected text as plain text.

Text:
${input}
`.trim();

    const raw = await provider.generateText(prompt, { temperature: 0.2, maxOutputTokens: 1024 });
    const corrected = (raw || '')
      .replace(/^```[a-zA-Z]*\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim() || input;

    res.json({ success: true, data: { text: corrected } });
  } catch (error: any) {
    console.error('Run note grammar error:', error);
    res.status(500).json({ success: false, error: 'Failed to polish the note' });
  }
};

/**
 * Create a test case mid-run and wire it up in one step.
 *
 * When a tester finds a defect no existing case covers, they shouldn't have to
 * leave the run, create the case, link it to the suite and rebuild the run.
 * This creates the case under the suite's scenario, links it to the suite, and
 * adds a result row to THIS run so it appears immediately.
 */
export const addCaseToRun = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { runId } = req.params;
    const {
      name, description, preconditions, steps_to_reproduce, expected_result,
      priority, severity, test_type, automation,
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'Test case name is required' });
    }

    // The run tells us the suite; the suite tells us the scenario and module.
    const { rows: runRows } = await client.query(
      `SELECT tr.id, tr.suite_id, ts.parent_test_case_id, ts.module_id
         FROM qa_test_runs tr
         LEFT JOIN qa_test_suites ts ON tr.suite_id = ts.id
        WHERE tr.id = $1 AND tr.tenant_id = $2`,
      [runId, tenantId]
    );
    if (!runRows.length) return res.status(404).json({ success: false, error: 'Test Run not found' });

    const { suite_id, parent_test_case_id, module_id } = runRows[0];
    if (!suite_id) {
      return res.status(400).json({ success: false, error: 'This run has no suite to link the case to' });
    }

    await client.query('BEGIN');

    const { rows: countRows } = await client.query(
      `SELECT COUNT(*) FROM qa_test_cases WHERE tenant_id = $1`,
      [tenantId]
    );
    const testCaseRef = `TC-${1000 + parseInt(countRows[0].count, 10) + 1}`;

    const { rows: caseRows } = await client.query(
      `INSERT INTO qa_test_cases (
         tenant_id, parent_test_case_id, test_case_id, name, module_id, description, preconditions,
         steps_to_reproduce, expected_result, priority, severity, test_type, automation,
         status, owner, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [
        tenantId, parent_test_case_id || null, testCaseRef, name, module_id || null,
        description || null, preconditions || null,
        steps_to_reproduce ? JSON.stringify(steps_to_reproduce) : null,
        expected_result || null, priority || 'Medium', severity || 'Major',
        test_type || 'Functional', automation || 'Manual', 'Active', userId, userId,
      ]
    );
    const testCase = caseRows[0];

    // Link to the suite so future runs pick it up too
    await client.query(
      `INSERT INTO qa_test_suite_cases (tenant_id, test_suite_id, test_case_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [tenantId, suite_id, testCase.id]
    );

    // Add it to this run so the tester can record a result right away
    const { rows: resultRows } = await client.query(
      `INSERT INTO qa_test_run_results (tenant_id, test_run_id, test_case_id)
       VALUES ($1, $2, $3) RETURNING *`,
      [tenantId, runId, testCase.id]
    );

    await client.query('COMMIT');

    // Same shape as getTestRun's results, so the client can append it directly
    res.status(201).json({
      success: true,
      data: {
        ...resultRows[0],
        tc_ref_id: testCase.test_case_id,
        name: testCase.name,
        priority: testCase.priority,
        test_type: testCase.test_type,
        severity: testCase.severity,
        automation: testCase.automation,
        case_status: testCase.status,
        description: testCase.description,
        preconditions: testCase.preconditions,
        steps_to_reproduce: testCase.steps_to_reproduce,
        expected_result: testCase.expected_result,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error adding case to run:', error);
    res.status(500).json({ success: false, error: 'Failed to add the test case' });
  } finally {
    client.release();
  }
};

import { uploadRunAttachmentToR2, deleteFileFromR2 } from '../utils/r2Client';

let runAttachmentsColumnReady = false;
/** Adds the attachments column on first use, so no manual migration is needed. */
const ensureAttachmentsColumn = async () => {
  if (runAttachmentsColumnReady) return;
  try {
    await pool.query(
      `ALTER TABLE qa_test_run_results ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb`
    );
    runAttachmentsColumnReady = true;
  } catch (e) {
    console.error('Failed to ensure attachments column:', e);
  }
};

let runBugColumnReady = false;
/** False where the bug list module was never migrated — don't join a missing table. */
let bugsTableExists = false;
/** Remembers which bug a failed case was filed as, so it can't be filed twice. */
const ensureBugLinkColumn = async () => {
  if (runBugColumnReady) return bugsTableExists;
  try {
    await pool.query(`ALTER TABLE qa_test_run_results ADD COLUMN IF NOT EXISTS bug_id TEXT`);
    const { rows } = await pool.query(`SELECT to_regclass('public.bugs') AS t`);
    bugsTableExists = !!rows[0]?.t;
    runBugColumnReady = true;
  } catch (e) {
    console.error('Failed to ensure bug_id column:', e);
  }
  return bugsTableExists;
};

/**
 * Record the bug a failed case was filed as. The link is what stops the same
 * failure being logged again on a later visit — the session-only guard on the
 * client disappears the moment the page reloads.
 */
export const linkResultBug = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { runId, resultId } = req.params;
    const { bugId } = req.body || {};
    if (!bugId) return res.status(400).json({ success: false, error: 'bugId is required' });

    await ensureBugLinkColumn();

    // The bug has to be this tenant's, and still live
    const { rows: bugRows } = await pool.query(
      `SELECT id, bug_number FROM bugs
       WHERE id = $1 AND tenant_id = $2 AND status <> 'trash'`,
      [bugId, String(tenantId)]
    );
    if (!bugRows.length) return res.status(404).json({ success: false, error: 'Bug not found' });

    // Never overwrite an existing link — the first bug filed owns the case
    const { rows } = await pool.query(
      `UPDATE qa_test_run_results SET bug_id = COALESCE(bug_id, $1), updated_at = NOW()
       WHERE id = $2 AND test_run_id = $3 AND tenant_id = $4
       RETURNING id, bug_id`,
      [bugId, resultId, runId, tenantId]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Result not found' });

    // COALESCE may have kept an earlier bug — report whichever one won
    let bugNumber = bugRows[0].bug_number;
    if (rows[0].bug_id !== bugId) {
      const { rows: kept } = await pool.query(
        `SELECT bug_number FROM bugs WHERE id = $1 AND tenant_id = $2`,
        [rows[0].bug_id, String(tenantId)]
      );
      bugNumber = kept[0]?.bug_number ?? null;
    }

    res.status(200).json({
      success: true,
      data: { id: rows[0].id, bug_id: rows[0].bug_id, bug_number: bugNumber, bug_logged: true },
    });
  } catch (error) {
    console.error('Error linking bug to run result:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

/**
 * Attach evidence to a run result — either an uploaded/pasted file (stored in
 * R2) or a link to something hosted elsewhere.
 */
export const addResultAttachment = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    await ensureAttachmentsColumn();

    const { runId, resultId } = req.params;
    const { base64, fileName, url, name } = req.body || {};

    // Confirm the result belongs to this tenant before storing anything
    const { rows: existing } = await pool.query(
      `SELECT id, attachments FROM qa_test_run_results
        WHERE id = $1 AND test_run_id = $2 AND tenant_id = $3`,
      [resultId, runId, tenantId]
    );
    if (!existing.length) return res.status(404).json({ success: false, error: 'Result not found' });

    let attachment: any;

    if (base64) {
      const uploaded = await uploadRunAttachmentToR2(base64, fileName || name || 'attachment', tenantId, runId, resultId);
      attachment = {
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        kind: 'file',
        name: (name || fileName || 'Attachment').trim(),
        url: uploaded.fileUrl,
        fileType: uploaded.fileType,
        fileSize: uploaded.fileSize,
        uploadedBy: userId || null,
        uploadedAt: new Date().toISOString(),
      };
    } else if (url) {
      const clean = String(url).trim();
      if (!/^https?:\/\//i.test(clean)) {
        return res.status(400).json({ success: false, error: 'Link must start with http:// or https://' });
      }
      attachment = {
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        kind: 'link',
        name: (name || clean).trim(),
        url: clean,
        uploadedBy: userId || null,
        uploadedAt: new Date().toISOString(),
      };
    } else {
      return res.status(400).json({ success: false, error: 'Provide a file or a link' });
    }

    const next = [...(existing[0].attachments || []), attachment];
    await pool.query(
      `UPDATE qa_test_run_results SET attachments = $1, updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3`,
      [JSON.stringify(next), resultId, tenantId]
    );

    res.status(201).json({ success: true, data: { attachment, attachments: next } });
  } catch (error: any) {
    console.error('Error adding attachment:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to add the attachment' });
  }
};

/** Remove an attachment, deleting the stored file when we own it. */
export const deleteResultAttachment = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    await ensureAttachmentsColumn();

    const { runId, resultId, attachmentId } = req.params;

    const { rows } = await pool.query(
      `SELECT attachments FROM qa_test_run_results
        WHERE id = $1 AND test_run_id = $2 AND tenant_id = $3`,
      [resultId, runId, tenantId]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Result not found' });

    const current: any[] = rows[0].attachments || [];
    const target = current.find((a) => a.id === attachmentId);
    const next = current.filter((a) => a.id !== attachmentId);

    await pool.query(
      `UPDATE qa_test_run_results SET attachments = $1, updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3`,
      [JSON.stringify(next), resultId, tenantId]
    );

    // Links point at someone else's storage — only clean up files we uploaded
    if (target?.kind === 'file' && target.url) {
      await deleteFileFromR2(target.url, tenantId).catch((e) =>
        console.error('Failed to delete attachment from R2:', e)
      );
    }

    res.status(200).json({ success: true, data: { attachments: next } });
  } catch (error: any) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ success: false, error: 'Failed to remove the attachment' });
  }
};
