import { Request, Response } from 'express';
import pool from '../config/dbpool';

let projectColumnReady = false;
/** Test cases belong to a project so bugs raised from them land in the right list. */
const ensureProjectColumn = async () => {
  if (projectColumnReady) return;
  try {
    await pool.query(`ALTER TABLE qa_parent_test_cases ADD COLUMN IF NOT EXISTS project_id TEXT`);
    projectColumnReady = true;
  } catch (e) {
    console.error('Failed to ensure project_id column:', e);
  }
};

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

export const getParentTestCases = async (req: Request, res: Response) => {
  try {
    await ensureModuleFkDropped();
    await ensureProjectColumn();
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { module_id, search, limit, page = '1', pageSize = '10', status, automation, owner, quickFilter } = req.query;

    const parsedLimit = limit ? parseInt(limit as string, 10) : parseInt(pageSize as string, 10) || 10;
    const parsedPage = parseInt(page as string, 10) || 1;
    const offset = (parsedPage - 1) * parsedLimit;

    // Helper to build WHERE conditions
    const applyFilters = (q: string, p: any[]) => {
      let queryStr = q;
      if (module_id) {
        p.push(module_id);
        queryStr += ` AND ptc.module_id::text = $${p.length}::text`;
      }
      if (search) {
        p.push(`%${search}%`);
        queryStr += ` AND (ptc.title ILIKE $${p.length} OR mv2.name ILIKE $${p.length} OR m.module_name ILIKE $${p.length} OR ptc.feature ILIKE $${p.length})`;
      }
      if (status) {
        p.push(status);
        queryStr += ` AND ptc.status = $${p.length}`;
      }
      if (automation) {
        p.push(automation);
        queryStr += ` AND ptc.automation = $${p.length}`;
      }
      if (owner) {
        p.push(owner);
        queryStr += ` AND (u_owner.name = $${p.length} OR u_creator.name = $${p.length})`;
      }
      if (quickFilter === 'ready') {
        queryStr += ` AND (ptc.status = 'Ready' OR ptc.status = 'Active')`;
      } else if (quickFilter === 'automated') {
        queryStr += ` AND ptc.automation = 'Automated'`;
      }
      return queryStr;
    };

    let query = `
      SELECT ptc.*, COALESCE(mv2.name, m.module_name, 'Unassigned') as module_name,
      u_owner.name as owner_name, u_creator.name as creator_name,
      COALESCE(u_owner.name, u_creator.name, '—') as qa_owner,
      (SELECT COUNT(*) FROM qa_test_suites s WHERE s.parent_test_case_id::text = ptc.id::text) as suite_count,
      (SELECT COUNT(*) FROM qa_test_cases tc WHERE tc.parent_test_case_id::text = ptc.id::text) as child_count,
      COALESCE(
        (
          SELECT json_agg(json_build_object('id', s.id, 'suite_name', s.suite_name, 'description', s.description))
          FROM qa_test_suites s
          WHERE s.parent_test_case_id::text = ptc.id::text
        ),
        '[]'::json
      ) as test_suites
      FROM qa_parent_test_cases ptc
      LEFT JOIN qa_todo_modules m ON ptc.module_id::text = m.id::text
      LEFT JOIN modules_v2 mv2 ON ptc.module_id::text = mv2.id::text
      LEFT JOIN users u_owner ON ptc.owner::text = u_owner.id::text
      LEFT JOIN users u_creator ON ptc.created_by::text = u_creator.id::text
      WHERE ptc.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    query = applyFilters(query, params);

    let countQuery = `
      SELECT COUNT(*) FROM qa_parent_test_cases ptc
      LEFT JOIN qa_todo_modules m ON ptc.module_id::text = m.id::text
      LEFT JOIN modules_v2 mv2 ON ptc.module_id::text = mv2.id::text
      LEFT JOIN users u_owner ON ptc.owner::text = u_owner.id::text
      LEFT JOIN users u_creator ON ptc.created_by::text = u_creator.id::text
      WHERE ptc.tenant_id = $1
    `;
    const countParams: any[] = [tenantId];
    countQuery = applyFilters(countQuery, countParams);

    query += ` ORDER BY ptc.updated_at DESC`;
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
    console.error('Error fetching parent test cases:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const getParentTestCase = async (req: Request, res: Response) => {
  try {
    await ensureModuleFkDropped();
    await ensureProjectColumn();
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.params;

    const { rows } = await pool.query(`
      SELECT ptc.*, COALESCE(mv2.name, m.module_name, 'Unassigned') as module_name,
      u_owner.name as owner_name, u_creator.name as creator_name,
      COALESCE(u_owner.name, u_creator.name, '—') as qa_owner,
      (SELECT COUNT(*) FROM qa_test_suites s WHERE s.parent_test_case_id::text = ptc.id::text) as suite_count,
      (SELECT COUNT(*) FROM qa_test_cases tc WHERE tc.parent_test_case_id::text = ptc.id::text) as child_count,
      COALESCE(
        (
          SELECT json_agg(json_build_object('id', s.id, 'suite_name', s.suite_name, 'description', s.description))
          FROM qa_test_suites s
          WHERE s.parent_test_case_id::text = ptc.id::text
        ),
        '[]'::json
      ) as test_suites
      FROM qa_parent_test_cases ptc
      LEFT JOIN qa_todo_modules m ON ptc.module_id::text = m.id::text
      LEFT JOIN modules_v2 mv2 ON ptc.module_id::text = mv2.id::text
      LEFT JOIN users u_owner ON ptc.owner::text = u_owner.id::text
      LEFT JOIN users u_creator ON ptc.created_by::text = u_creator.id::text
      WHERE ptc.id = $1 AND ptc.tenant_id = $2
    `, [id, tenantId]);

    if (!rows.length) return res.status(404).json({ success: false, error: 'Parent Test Case not found' });

    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error fetching parent test case:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const createParentTestCase = async (req: Request, res: Response) => {
  try {
    await ensureModuleFkDropped();
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id || null;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    await ensureProjectColumn();
    const { title, module_id, feature, automation, owner, status, project_id } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Title is required' });

    const ownerToUse = owner || userId;

    const { rows } = await pool.query(`
      INSERT INTO qa_parent_test_cases (tenant_id, title, module_id, feature, automation, owner, status, project_id, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      tenantId,
      title,
      module_id || null,
      feature || null,
      automation || 'Manual',
      ownerToUse,
      status || 'Draft',
      project_id || null,
      userId,
      userId
    ]);

    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error creating parent test case:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const updateParentTestCase = async (req: Request, res: Response) => {
  try {
    await ensureModuleFkDropped();
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id || null;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.params;

    await ensureProjectColumn();
    const { title, module_id, feature, automation, owner, status, project_id } = req.body;

    const { rows } = await pool.query(`
      UPDATE qa_parent_test_cases
      SET title = COALESCE($1, title),
          module_id = $2,
          feature = $3,
          automation = COALESCE($4, automation),
          owner = $5,
          status = COALESCE($6, status),
          project_id = COALESCE($7, project_id),
          updated_by = $8,
          updated_at = NOW()
      WHERE id = $9 AND tenant_id = $10
      RETURNING *
    `, [title, module_id || null, feature || null, automation, owner || null, status, project_id || null, userId, id, tenantId]);

    if (!rows.length) return res.status(404).json({ success: false, error: 'Parent Test Case not found' });

    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error updating parent test case:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const deleteParentTestCase = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.params;

    const { rowCount } = await pool.query(`DELETE FROM qa_parent_test_cases WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (!rowCount) return res.status(404).json({ success: false, error: 'Parent Test Case not found' });

    res.status(200).json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting parent test case:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};
