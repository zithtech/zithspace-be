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

// Utility to generate Test Case ID (e.g. TC-1001)
const generateTestCaseId = async (tenantId: string) => {
  const { rows } = await pool.query(`SELECT COUNT(*) FROM qa_test_cases WHERE tenant_id = $1`, [tenantId]);
  const count = parseInt(rows[0].count, 10);
  return `TC-${1000 + count + 1}`;
};

export const getTestCases = async (req: Request, res: Response) => {
  try {
    await ensureModuleFkDropped();
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    // Allow filtering by module_id and parent_test_case_id
    const { module_id, parent_test_case_id, parent_id, search, limit } = req.query;
    const parentId = parent_test_case_id || parent_id;

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
      WHERE tc.tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (module_id) {
      params.push(module_id);
      query += ` AND tc.module_id::text = $${params.length}::text`;
    }
    if (parentId) {
      params.push(parentId);
      query += ` AND tc.parent_test_case_id::text = $${params.length}::text`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (tc.name ILIKE $${params.length} OR tc.test_case_id ILIKE $${params.length})`;
    }

    query += ` ORDER BY tc.created_at DESC`;
    if (limit) {
      params.push(parseInt(limit as string, 10));
      query += ` LIMIT $${params.length}`;
    }

    const { rows } = await pool.query(query, params);
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching test cases:', error);
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

    const test_case_id = await generateTestCaseId(tenantId);

    const {
      parent_test_case_id, parent_id, name, module_id, feature, description, preconditions, steps_to_reproduce,
      expected_result, priority, severity, test_type, automation, status, owner, qa_owner
    } = req.body;
    const assignedOwner = owner || qa_owner || userId || null;
    const parentId = parent_test_case_id || parent_id || null;

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
