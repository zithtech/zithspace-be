import { Request, Response } from 'express';
import pool from '../config/dbpool';

let schemaFixed = false;
const ensureModuleFkDropped = async () => {
  if (schemaFixed) return;
  try {
    await pool.query(`ALTER TABLE qa_parent_test_cases DROP CONSTRAINT IF EXISTS qa_parent_test_cases_module_id_fkey;`).catch(() => {});
    await pool.query(`ALTER TABLE qa_test_cases DROP CONSTRAINT IF EXISTS qa_test_cases_module_id_fkey;`).catch(() => {});
    await pool.query(`ALTER TABLE qa_test_suites DROP CONSTRAINT IF EXISTS qa_test_suites_module_id_fkey;`).catch(() => {});
    schemaFixed = true;
  } catch (e) {
    // Ignore error if tables don't exist yet
  }
};

// Utility to generate Test Case ID (e.g. TC-001 for parent-specific, TC-1001 for global)
const generateTestCaseId = async (tenantId: string, parentId?: string | null) => {
  if (parentId) {
    const { rows } = await pool.query(`SELECT COUNT(*) FROM qa_test_cases WHERE tenant_id = $1 AND parent_test_case_id = $2`, [tenantId, parentId]);
    const count = parseInt(rows[0].count, 10);
    return `TC-${String(count + 1).padStart(3, '0')}`;
  } else {
    const { rows } = await pool.query(`SELECT COUNT(*) FROM qa_test_cases WHERE tenant_id = $1 AND parent_test_case_id IS NULL`, [tenantId]);
    const count = parseInt(rows[0].count, 10);
    return `TC-${1000 + count + 1}`;
  }
};

export const getTestCases = async (req: Request, res: Response) => {
  try {
    await ensureModuleFkDropped();
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    // Allow filtering by module_id and parent_test_case_id
    const { module_id, parent_test_case_id, parent_id, search, test_type, priority, status, quickFilter, sort, limit, offset, ids_only, paginated, page, pageSize } = req.query;
    const parentId = parent_test_case_id || parent_id;

    // Filters are built once so the count, the id-only and the full queries
    // all stay in sync as the page is scrolled.
    const params: any[] = [tenantId];
    let where = ` WHERE tc.tenant_id = $1`;

    if (module_id) {
      params.push(module_id);
      where += ` AND tc.module_id::text = $${params.length}::text`;
    }
    if (parentId) {
      params.push(parentId);
      where += ` AND tc.parent_test_case_id::text = $${params.length}::text`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (tc.name ILIKE $${params.length} OR tc.test_case_id ILIKE $${params.length})`;
    }
    // Matched case-insensitively: the same type is often recorded as
    // "Functional" in one case and "functional" in the next.
    if (test_type) {
      params.push(String(test_type));
      where += ` AND LOWER(TRIM(COALESCE(tc.test_type, ''))) = LOWER(TRIM($${params.length}))`;
    }
    if (priority) {
      params.push(String(priority));
      where += ` AND LOWER(TRIM(COALESCE(tc.priority, ''))) = LOWER(TRIM($${params.length}))`;
    }
    if (status) {
      params.push(String(status));
      where += ` AND LOWER(TRIM(COALESCE(tc.status, ''))) = LOWER(TRIM($${params.length}))`;
    }
    if (quickFilter === 'ready') {
      where += ` AND (tc.status = 'Ready' OR tc.status = 'Active')`;
    } else if (quickFilter === 'automated') {
      where += ` AND tc.automation = 'Automated'`;
    }

    const sortOrder = sort === 'desc' ? 'DESC' : 'ASC';

    // Cheap id-only mode, used by "select all" so the client can act on every
    // match without pulling the rows it hasn't scrolled to yet.
    if (ids_only === 'true' || ids_only === '1') {
      const { rows } = await pool.query(
        `SELECT tc.id FROM qa_test_cases tc${where} ORDER BY tc.created_at ${sortOrder}, tc.id ${sortOrder}`,
        params
      );
      return res.status(200).json({ success: true, data: rows, total: rows.length });
    }

    let query = `
      SELECT tc.*, COALESCE(mv2.name, m.module_name, 'Unassigned') as module_name, 
      u_owner.name as owner_name, u_creator.name as creator_name,
      COALESCE(u_owner.name, u_creator.name, '—') as qa_owner,
      (SELECT COUNT(*) FROM qa_test_suite_cases tsc WHERE tsc.test_case_id::text = tc.id::text) as suite_count,
      COALESCE(
        (
          SELECT json_agg(json_build_object('id', s.id, 'suite_name', s.suite_name, 'description', s.description, 'module_id', s.module_id))
          FROM qa_test_suite_cases tsc
          JOIN qa_test_suites s ON tsc.test_suite_id::text = s.id::text
          WHERE tsc.test_case_id::text = tc.id::text
        ),
        '[]'::json
      ) as test_suites
      FROM qa_test_cases tc
      LEFT JOIN qa_todo_modules m ON tc.module_id::text = m.id::text
      LEFT JOIN modules_v2 mv2 ON tc.module_id::text = mv2.id::text
      LEFT JOIN users u_owner ON tc.owner::text = u_owner.id::text
      LEFT JOIN users u_creator ON tc.created_by::text = u_creator.id::text
    ` + where;

    // The id breaks ties. Cases written in one transaction share created_at to
    // the microsecond, and without a total order Postgres is free to return
    // them differently per query — which makes LIMIT/OFFSET paging repeat a row
    // on page 2 and drop another entirely.
    query += ` ORDER BY tc.created_at ${sortOrder}, tc.id ${sortOrder}`;

    const parsedPageSize = pageSize ? parseInt(pageSize as string, 10) : null;
    const parsedPage = page ? parseInt(page as string, 10) : 1;
    const parsedLimit = parsedPageSize || (limit ? parseInt(limit as string, 10) : null);
    const parsedOffset = parsedPageSize ? (parsedPage - 1) * parsedPageSize : (offset ? parseInt(offset as string, 10) : 0);
    const pageParams = [...params];

    if (parsedLimit && parsedLimit > 0) {
      pageParams.push(parsedLimit);
      query += ` LIMIT $${pageParams.length}`;
      if (parsedOffset > 0) {
        pageParams.push(parsedOffset);
        query += ` OFFSET $${pageParams.length}`;
      }
    }

    const { rows } = await pool.query(query, pageParams);

    // Standard pagination envelope if page/pageSize is provided
    if (page || pageSize) {
      const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM qa_test_cases tc${where}`, params);
      const total = countRes.rows[0]?.total ?? rows.length;
      return res.status(200).json({
        success: true,
        data: rows,
        pagination: {
          total,
          page: parsedPage,
          pageSize: parsedLimit || 10,
          totalPages: Math.ceil(total / (parsedLimit || 10))
        }
      });
    }

    // Opt-in envelope: infinite-scroll callers need the total and a next-page
    // flag. Everyone else keeps receiving a bare array.
    if (paginated === 'true' || paginated === '1') {
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total FROM qa_test_cases tc${where}`,
        params
      );
      const total = countRes.rows[0]?.total ?? rows.length;
      return res.status(200).json({
        success: true,
        data: {
          items: rows,
          total,
          offset: parsedOffset,
          limit: parsedLimit,
          hasMore: parsedOffset + rows.length < total,
        },
      });
    }

    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching test cases:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

/**
 * The testing types actually recorded on the cases in a scope, with a count
 * each. Suite building filters by these, so offering the full standard list
 * would mean picking "Security Testing" only to find no case carries it — the
 * options here are exactly the ones that select something.
 *
 * Types differing only by case or spacing are folded together and reported
 * under the spelling that appears most often.
 */
export const getTestCaseTypeFacets = async (req: Request, res: Response) => {
  try {
    await ensureModuleFkDropped();
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { module_id, parent_test_case_id, parent_id, search } = req.query;
    const parentId = parent_test_case_id || parent_id;

    const params: any[] = [tenantId];
    let where = ` WHERE tc.tenant_id = $1 AND COALESCE(TRIM(tc.test_type), '') <> ''`;

    if (module_id) {
      params.push(module_id);
      where += ` AND tc.module_id::text = $${params.length}::text`;
    }
    if (parentId) {
      params.push(parentId);
      where += ` AND tc.parent_test_case_id::text = $${params.length}::text`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (tc.name ILIKE $${params.length} OR tc.test_case_id ILIKE $${params.length})`;
    }

    const { rows } = await pool.query(
      `SELECT (array_agg(t ORDER BY n DESC, t ASC))[1] AS test_type, SUM(n)::int AS count
       FROM (
         SELECT TRIM(tc.test_type) AS t, COUNT(*)::int AS n
         FROM qa_test_cases tc${where}
         GROUP BY TRIM(tc.test_type)
       ) s
       GROUP BY LOWER(t)
       ORDER BY SUM(n) DESC, 1 ASC`,
      params
    );

    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching testing type facets:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const getTestCase = async (req: Request, res: Response) => {
  try {
    await ensureModuleFkDropped();
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.params;

    const { rows } = await pool.query(`
      SELECT tc.*, COALESCE(mv2.name, m.module_name, 'Unassigned') as module_name, 
      u_owner.name as owner_name, u_creator.name as creator_name,
      COALESCE(u_owner.name, u_creator.name, '—') as qa_owner,
      (SELECT COUNT(*) FROM qa_test_suite_cases tsc WHERE tsc.test_case_id::text = tc.id::text) as suite_count,
      COALESCE(
        (
          SELECT json_agg(json_build_object('id', s.id, 'suite_name', s.suite_name, 'description', s.description, 'module_id', s.module_id))
          FROM qa_test_suite_cases tsc
          JOIN qa_test_suites s ON tsc.test_suite_id::text = s.id::text
          WHERE tsc.test_case_id::text = tc.id::text
        ),
        '[]'::json
      ) as test_suites
      FROM qa_test_cases tc
      LEFT JOIN qa_todo_modules m ON tc.module_id::text = m.id::text
      LEFT JOIN modules_v2 mv2 ON tc.module_id::text = mv2.id::text
      LEFT JOIN users u_owner ON tc.owner::text = u_owner.id::text
      LEFT JOIN users u_creator ON tc.created_by::text = u_creator.id::text
      WHERE tc.id = $1 AND tc.tenant_id = $2
    `, [id, tenantId]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Test Case not found' });

    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error fetching test case:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const createTestCase = async (req: Request, res: Response) => {
  try {
    await ensureModuleFkDropped();
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const {
      parent_test_case_id, parent_id, name, module_id, feature, description, preconditions, steps_to_reproduce,
      expected_result, priority, severity, test_type, automation, status, owner, qa_owner
    } = req.body;
    const assignedOwner = owner || qa_owner || userId || null;
    const parentId = parent_test_case_id || parent_id || null;

    const test_case_id = await generateTestCaseId(tenantId, parentId);

    const { rows } = await pool.query(
      `INSERT INTO qa_test_cases (
        tenant_id, parent_test_case_id, test_case_id, name, module_id, feature, description, preconditions, 
        steps_to_reproduce, expected_result, priority, severity, test_type, automation, 
        status, owner, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`,
      [
        tenantId, parentId, test_case_id, name, module_id || null, feature, description, preconditions,
        steps_to_reproduce, expected_result, priority, severity, test_type, automation,
        status || 'Draft', assignedOwner, userId
      ]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error creating test case:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const updateTestCase = async (req: Request, res: Response) => {
  try {
    await ensureModuleFkDropped();
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { id } = req.params;
    const {
      parent_test_case_id, parent_id, name, module_id, feature, description, preconditions, steps_to_reproduce,
      expected_result, priority, severity, test_type, automation, status, owner, qa_owner
    } = req.body;
    const assignedOwner = owner || qa_owner || null;
    const parentId = parent_test_case_id || parent_id || null;

    const { rows } = await pool.query(
      `UPDATE qa_test_cases SET 
        parent_test_case_id = COALESCE($1, parent_test_case_id), name = $2, module_id = $3, feature = $4, description = $5, preconditions = $6,
        steps_to_reproduce = $7, expected_result = $8, priority = $9, severity = $10,
        test_type = $11, automation = $12, status = $13, owner = $14, updated_by = $15, updated_at = NOW()
       WHERE id = $16 AND tenant_id = $17 RETURNING *`,
      [
        parentId, name, module_id || null, feature, description, preconditions,
        steps_to_reproduce, expected_result, priority, severity,
        test_type, automation, status, assignedOwner, userId, id, tenantId
      ]
    );

    if (!rows.length) return res.status(404).json({ success: false, error: 'Test Case not found' });
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error updating test case:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const deleteTestCase = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.params;

    await pool.query(`DELETE FROM qa_test_cases WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    res.status(200).json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting test case:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

import { getAIProviderForTenant } from '../services/ai/resolver';

/**
 * Draft a module test case from a plain-language description.
 * Returns the name, reproduction steps and expected result so the drawer can
 * prefill itself — the QA engineer still reviews and saves.
 */
export const generateTestCaseAI = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No tenant found' });
    }

    const { prompt, scenarioTitle, moduleName, feature } = req.body || {};
    const instruction = (prompt || '').trim();
    if (!instruction) {
      return res.status(400).json({ success: false, error: 'Describe the test case you want to generate' });
    }
    if (instruction.length > 2000) {
      return res.status(400).json({ success: false, error: 'Description is too long (max 2000 characters)' });
    }

    const provider = await getAIProviderForTenant(tenantId);
    if (!provider || !provider.isConfigured()) {
      return res.status(400).json({ success: false, error: 'AI provider is not configured. Please add an API key in .env or Tenant AI settings.' });
    }

    const aiPrompt = `
You are a senior QA engineer writing a single module test case.

Business scenario: ${scenarioTitle || 'N/A'}
Module: ${moduleName || 'N/A'}
Feature: ${feature || 'N/A'}

What the tester described:
${instruction}

Return ONLY a JSON object with exactly these keys, no markdown fences and no commentary:
{
  "name": "concise test case title, max 90 characters, starts with a verb like Verify or Validate",
  "description": "one or two sentences on what this case covers",
  "preconditions": "what must be true before the steps run, or an empty string",
  "steps_to_reproduce": ["one action per item, imperative, no leading numbers"],
  "expected_result": "the single observable outcome that means this case passed",
  "test_type": "one of Functional, UI, API, Regression, Security, Performance, Usability",
  "priority": "one of Low, Medium, High, Critical",
  "severity": "one of Minor, Major, Critical"
}
Write 3 to 8 steps. Cover the validation and error paths the tester mentioned.
`.trim();

    const raw = await provider.generateText(aiPrompt, { temperature: 0.5, maxOutputTokens: 2048 });

    const cleaned = (raw || '')
      .replace(/^```[a-zA-Z]*\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Models sometimes wrap the object in prose — salvage the outermost braces
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start === -1 || end === -1) {
        return res.status(502).json({ success: false, error: 'AI returned an unexpected format. Try rephrasing.' });
      }
      try {
        parsed = JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return res.status(502).json({ success: false, error: 'AI returned an unexpected format. Try rephrasing.' });
      }
    }

    const steps = Array.isArray(parsed.steps_to_reproduce)
      ? parsed.steps_to_reproduce.map((s: any) => String(s).replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean)
      : [];

    res.json({
      success: true,
      data: {
        name: String(parsed.name || '').slice(0, 200),
        description: String(parsed.description || ''),
        preconditions: String(parsed.preconditions || ''),
        steps_to_reproduce: steps,
        expected_result: String(parsed.expected_result || ''),
        test_type: parsed.test_type ? String(parsed.test_type) : undefined,
        priority: parsed.priority ? String(parsed.priority) : undefined,
        severity: parsed.severity ? String(parsed.severity) : undefined,
      },
    });
  } catch (err: any) {
    console.error('Failed to generate test case', err);
    res.status(500).json({ success: false, error: 'Failed to generate test case' });
  }
};
