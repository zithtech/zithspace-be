import { Request, Response } from 'express';
import pool from '../config/dbpool';

let schemaFixed = false;
const ensureModuleFkDropped = async () => {
  if (schemaFixed) return;
  try {
    await pool.query(`ALTER TABLE qa_parent_test_cases DROP CONSTRAINT IF EXISTS qa_parent_test_cases_module_id_fkey;`).catch(() => {});
    await pool.query(`ALTER TABLE qa_test_cases DROP CONSTRAINT IF EXISTS qa_test_cases_module_id_fkey;`).catch(() => {});
    await pool.query(`ALTER TABLE qa_test_suites DROP CONSTRAINT IF EXISTS qa_test_suites_module_id_fkey;`).catch(() => {});
    // What kind of testing the suite performs. Free text rather than an enum:
    // teams name these differently, and the picker offers the values already in
    // use alongside the standard list, so a custom type spreads by being used.
    await pool.query(`ALTER TABLE qa_test_suites ADD COLUMN IF NOT EXISTS testing_type VARCHAR(120)`).catch(() => {});
    schemaFixed = true;
  } catch (e) {
    // Ignore error if tables don't exist yet
  }
};

export const getTestSuites = async (req: Request, res: Response) => {
  try {
    await ensureModuleFkDropped();
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    
    const { module_id, parent_test_case_id, parent_id, search, limit, page = '1', pageSize = '10', coverageFilter } = req.query;
    const parentId = parent_test_case_id || parent_id;

    const parsedLimit = limit ? parseInt(limit as string, 10) : parseInt(pageSize as string, 10) || 10;
    const parsedPage = parseInt(page as string, 10) || 1;
    const offset = (parsedPage - 1) * parsedLimit;

    let query = `
      SELECT ts.*, COALESCE(mv2.name, ptc_mv2.name, m.module_name, ptc_m.module_name, 'Unassigned') as module_name, ptc.title as parent_title,
      uc.name as created_by_name, uu.name as updated_by_name,
      (SELECT COUNT(*) FROM qa_test_suite_cases tsc WHERE tsc.test_suite_id::text = ts.id::text) as case_count
      FROM qa_test_suites ts
      LEFT JOIN qa_todo_modules m ON ts.module_id::text = m.id::text
      LEFT JOIN modules_v2 mv2 ON ts.module_id::text = mv2.id::text
      LEFT JOIN qa_parent_test_cases ptc ON ts.parent_test_case_id::text = ptc.id::text
      LEFT JOIN qa_todo_modules ptc_m ON ptc.module_id::text = ptc_m.id::text
      LEFT JOIN modules_v2 ptc_mv2 ON ptc.module_id::text = ptc_mv2.id::text
      LEFT JOIN users uc ON ts.created_by::text = uc.id::text
      LEFT JOIN users uu ON ts.updated_by::text = uu.id::text
      WHERE ts.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    
    // Helper to build WHERE conditions
    const applyFilters = (q: string, p: any[]) => {
      let queryStr = q;
      if (module_id) {
        p.push(module_id);
        queryStr += ` AND (ts.module_id::text = $${p.length}::text OR ptc.module_id::text = $${p.length}::text)`;
      }
      if (parentId) {
        p.push(parentId);
        queryStr += ` AND ts.parent_test_case_id::text = $${p.length}::text`;
      }
      if (search) {
        p.push(`%${search}%`);
        queryStr += ` AND (ts.suite_name ILIKE $${p.length} OR ptc.title ILIKE $${p.length})`;
      }
      if (coverageFilter) {
        const caseCountSubquery = `(SELECT COUNT(*) FROM qa_test_suite_cases tsc WHERE tsc.test_suite_id::text = ts.id::text)`;
        if (coverageFilter === 'linked') {
          queryStr += ` AND ${caseCountSubquery} > 0`;
        } else if (coverageFilter === 'empty') {
          queryStr += ` AND ${caseCountSubquery} = 0`;
        }
      }
      return queryStr;
    };

    query = applyFilters(query, params);
    
    let countQuery = `
      SELECT COUNT(*) FROM qa_test_suites ts
      LEFT JOIN qa_parent_test_cases ptc ON ts.parent_test_case_id::text = ptc.id::text
      WHERE ts.tenant_id = $1
    `;
    const countParams: any[] = [tenantId];
    countQuery = applyFilters(countQuery, countParams);

    query += ` ORDER BY ts.created_at DESC`;
    params.push(parsedLimit);
    query += ` LIMIT $${params.length}`;
    params.push(offset);
    query += ` OFFSET $${params.length}`;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams)
    ]);
    const total = parseInt(countRows[0].count, 10);

    res.status(200).json({ 
      success: true, 
      data: rows,
      pagination: {
        total,
        page: parsedPage,
        pageSize: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit)
      }
    });
  } catch (error) {
    console.error('Error fetching test suites:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const getTestSuite = async (req: Request, res: Response) => {
  try {
    await ensureModuleFkDropped();
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.params;
    
    const { rows: suiteRows } = await pool.query(`
      SELECT ts.*, COALESCE(mv2.name, ptc_mv2.name, m.module_name, ptc_m.module_name, 'Unassigned') as module_name, ptc.title as parent_title,
      uc.name as created_by_name, uu.name as updated_by_name
      FROM qa_test_suites ts
      LEFT JOIN qa_todo_modules m ON ts.module_id::text = m.id::text
      LEFT JOIN modules_v2 mv2 ON ts.module_id::text = mv2.id::text
      LEFT JOIN qa_parent_test_cases ptc ON ts.parent_test_case_id::text = ptc.id::text
      LEFT JOIN qa_todo_modules ptc_m ON ptc.module_id::text = ptc_m.id::text
      LEFT JOIN modules_v2 ptc_mv2 ON ptc.module_id::text = ptc_mv2.id::text
      LEFT JOIN users uc ON ts.created_by::text = uc.id::text
      LEFT JOIN users uu ON ts.updated_by::text = uu.id::text
      WHERE ts.id = $1 AND ts.tenant_id = $2
    `, [id, tenantId]);
    if (!suiteRows.length) return res.status(404).json({ success: false, error: 'Test Suite not found' });
    
    const suite = suiteRows[0];
    
    // Fetch mapped cases
    const { rows: caseRows } = await pool.query(`
      SELECT tc.* 
      FROM qa_test_suite_cases tsc
      JOIN qa_test_cases tc ON tsc.test_case_id::text = tc.id::text
      WHERE tsc.test_suite_id::text = $1 AND tsc.tenant_id = $2
    `, [id, tenantId]);
    
    suite.test_cases = caseRows;
    
    res.status(200).json({ success: true, data: suite });
  } catch (error) {
    console.error('Error fetching test suite:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const getTestSuiteCases = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.params;
    
    const { search, test_type, priority, status, quickFilter, limit, page = '1', pageSize = '10' } = req.query;

    const parsedLimit = limit ? parseInt(limit as string, 10) : parseInt(pageSize as string, 10) || 10;
    const parsedPage = parseInt(page as string, 10) || 1;
    const offset = (parsedPage - 1) * parsedLimit;

    let baseQuery = `
      FROM qa_test_suite_cases tsc
      JOIN qa_test_cases tc ON tsc.test_case_id::text = tc.id::text
      WHERE tsc.test_suite_id::text = $1 AND tsc.tenant_id = $2
    `;
    const params: any[] = [id, tenantId];

    if (search) {
      params.push(`%${search}%`);
      baseQuery += ` AND (tc.name ILIKE $${params.length} OR tc.test_case_id ILIKE $${params.length})`;
    }
    if (test_type) {
      params.push(String(test_type));
      baseQuery += ` AND tc.test_type = $${params.length}`;
    }
    if (priority) {
      params.push(String(priority));
      baseQuery += ` AND tc.priority = $${params.length}`;
    }
    if (status) {
      params.push(String(status));
      baseQuery += ` AND tc.status = $${params.length}`;
    }
    if (quickFilter === 'active') {
      baseQuery += ` AND (tc.status = 'Active' OR tc.status = 'Ready')`;
    } else if (quickFilter === 'automated') {
      baseQuery += ` AND tc.automation = 'Automated'`;
    } else if (quickFilter === 'highPriority') {
      baseQuery += ` AND (tc.priority = 'High' OR tc.priority = 'Critical')`;
    }

    const countQuery = `SELECT COUNT(*) ${baseQuery}`;
    
    let query = `SELECT tc.* ${baseQuery} ORDER BY tsc.created_at DESC`;
    params.push(parsedLimit);
    query += ` LIMIT $${params.length}`;
    params.push(offset);
    query += ` OFFSET $${params.length}`;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, params.slice(0, params.length - 2))
    ]);

    const total = parseInt(countRows[0].count, 10);

    res.status(200).json({ 
      success: true, 
      data: rows,
      pagination: {
        total,
        page: parsedPage,
        pageSize: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit)
      }
    });
  } catch (error) {
    console.error('Error fetching test suite cases:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const createTestSuite = async (req: Request, res: Response) => {
  await ensureModuleFkDropped();
  const client = await pool.connect();
  try {
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    
    const { suite_name, module_id, parent_test_case_id, parent_id, description, test_case_ids, testing_type } = req.body;
    const parentId = parent_test_case_id || parent_id || null;
    
    await client.query('BEGIN');
    
    // Create Suite
    const { rows: suiteRows } = await client.query(
      `INSERT INTO qa_test_suites (tenant_id, suite_name, module_id, parent_test_case_id, description, testing_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [tenantId, suite_name, module_id || null, parentId, description,
       (testing_type || '').trim() || null, userId]
    );
    const suiteId = suiteRows[0].id;
    
    // Create Mappings
    if (test_case_ids && Array.isArray(test_case_ids) && test_case_ids.length > 0) {
      for (const tcId of test_case_ids) {
        await client.query(
          `INSERT INTO qa_test_suite_cases (tenant_id, test_suite_id, test_case_id)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [tenantId, suiteId, tcId]
        );
      }
    }
    
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: suiteRows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating test suite:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  } finally {
    client.release();
  }
};

export const updateTestSuite = async (req: Request, res: Response) => {
  await ensureModuleFkDropped();
  const client = await pool.connect();
  try {
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    
    const { id } = req.params;
    const { suite_name, module_id, parent_test_case_id, parent_id, description, test_case_ids, testing_type } = req.body;
    const parentId = parent_test_case_id || parent_id || null;
    
    await client.query('BEGIN');
    
    const { rows: suiteRows } = await client.query(
      `UPDATE qa_test_suites SET 
        suite_name = $1, module_id = $2, parent_test_case_id = COALESCE($3, parent_test_case_id), description = $4,
        testing_type = $5, updated_by = $6, updated_at = NOW()
       WHERE id = $7 AND tenant_id = $8 RETURNING *`,
      [suite_name, module_id || null, parentId, description,
       (testing_type || '').trim() || null, userId, id, tenantId]
    );
    
    if (!suiteRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Test Suite not found' });
    }
    
    if (test_case_ids && Array.isArray(test_case_ids)) {
      // Delete existing mappings
      await client.query(`DELETE FROM qa_test_suite_cases WHERE test_suite_id::text = $1 AND tenant_id = $2`, [id, tenantId]);
      
      // Insert new mappings
      for (const tcId of test_case_ids) {
        await client.query(
          `INSERT INTO qa_test_suite_cases (tenant_id, test_suite_id, test_case_id)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [tenantId, id, tcId]
        );
      }
    }
    
    await client.query('COMMIT');
    res.status(200).json({ success: true, data: suiteRows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating test suite:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  } finally {
    client.release();
  }
};

export const deleteTestSuite = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.params;
    
    await pool.query(`DELETE FROM qa_test_suites WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    res.status(200).json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting test suite:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

import { getAIProviderForTenant } from '../services/ai/resolver';

/**
 * Text assistance for the suite description field.
 * mode 'generate' drafts a description from the suite's context;
 * mode 'grammar' does a light-touch copy edit of what the user wrote.
 */
export const suiteAiText = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No tenant found' });
    }

    const { mode, text, suiteName, scenarioTitle, moduleName, caseCount, userPrompt } = req.body || {};
    const input = (text || '').trim();
    const instruction = (userPrompt || '').trim().slice(0, 1000);

    if (mode === 'grammar' && !input) {
      return res.status(400).json({ success: false, error: 'Nothing to polish yet' });
    }
    if (input.length > 4000) {
      return res.status(400).json({ success: false, error: 'Text is too long (max 4000 characters)' });
    }

    const provider = await getAIProviderForTenant(tenantId);
    if (!provider || !provider.isConfigured()) {
      return res.status(400).json({ success: false, error: 'AI provider is not configured. Please add an API key in .env or Tenant AI settings.' });
    }

    const prompt = mode === 'grammar'
      ? `
You are a light-touch copy editor. Make ONLY minimal changes to the text below:
- Fix spelling, grammar, punctuation, capitalisation, and obvious typos.
- Preserve the author's voice, tone, structure, line breaks, and technical terms.
- Do NOT rewrite, summarise, expand, translate, or add anything new.
- Do NOT wrap in quotes or markdown. Do NOT add a preamble or explanation.
Return ONLY the corrected text as plain text.

Text:
${input}
`.trim()
      : `
You are a senior QA engineer describing a test suite.

Suite name: ${suiteName || 'N/A'}
Business scenario: ${scenarioTitle || 'N/A'}
Module: ${moduleName || 'N/A'}
Linked module cases: ${caseCount ?? 'N/A'}
${input ? `\nWhat the author already wrote:\n${input}\n` : ''}${instruction ? `\nThe author's instruction — follow it closely:\n${instruction}\n` : ''}
Write 2 to 3 sentences covering what this suite validates and when a team would run it.
Return ONLY plain text — no markdown, no headings, no preamble.
`.trim();

    const raw = await provider.generateText(prompt, {
      temperature: mode === 'grammar' ? 0.2 : 0.6,
      maxOutputTokens: 1024,
    });

    const cleaned = (raw?.text || '')
      .replace(/^```[a-zA-Z]*\s*/i, '')
      .replace(/\s*```$/i, '')
      .replace(/<[^>]*>/g, '')
      .trim();

    if (!cleaned) {
      return res.status(502).json({ success: false, error: 'AI returned an empty response' });
    }

    res.json({ success: true, data: { text: cleaned } });
  } catch (err: any) {
    console.error('Suite AI text error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate text' });
  }
};
