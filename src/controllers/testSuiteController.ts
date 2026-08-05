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

export const getTestSuites = async (req: Request, res: Response) => {
  try {
    await ensureModuleFkDropped();
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    
    const { module_id, parent_test_case_id, parent_id, search, limit } = req.query;
    const parentId = parent_test_case_id || parent_id;

    let query = `
      SELECT ts.*, COALESCE(mv2.name, ptc_mv2.name, m.module_name, ptc_m.module_name, 'Unassigned') as module_name, ptc.title as parent_title,
      (SELECT COUNT(*) FROM qa_test_suite_cases tsc WHERE tsc.test_suite_id::text = ts.id::text) as case_count
      FROM qa_test_suites ts
      LEFT JOIN qa_todo_modules m ON ts.module_id::text = m.id::text
      LEFT JOIN modules_v2 mv2 ON ts.module_id::text = mv2.id::text
      LEFT JOIN qa_parent_test_cases ptc ON ts.parent_test_case_id::text = ptc.id::text
      LEFT JOIN qa_todo_modules ptc_m ON ptc.module_id::text = ptc_m.id::text
      LEFT JOIN modules_v2 ptc_mv2 ON ptc.module_id::text = ptc_mv2.id::text
      WHERE ts.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    
    if (module_id) {
      params.push(module_id);
      query += ` AND (ts.module_id::text = $${params.length}::text OR ptc.module_id::text = $${params.length}::text)`;
    }
    if (parentId) {
      params.push(parentId);
      query += ` AND ts.parent_test_case_id::text = $${params.length}::text`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (ts.suite_name ILIKE $${params.length} OR ptc.title ILIKE $${params.length})`;
    }
    
    query += ` ORDER BY ts.created_at DESC`;
    if (limit) {
      params.push(parseInt(limit as string, 10));
      query += ` LIMIT $${params.length}`;
    }

    const { rows } = await pool.query(query, params);
    res.status(200).json({ success: true, data: rows });
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
      SELECT ts.*, COALESCE(mv2.name, ptc_mv2.name, m.module_name, ptc_m.module_name, 'Unassigned') as module_name, ptc.title as parent_title 
      FROM qa_test_suites ts
      LEFT JOIN qa_todo_modules m ON ts.module_id::text = m.id::text
      LEFT JOIN modules_v2 mv2 ON ts.module_id::text = mv2.id::text
      LEFT JOIN qa_parent_test_cases ptc ON ts.parent_test_case_id::text = ptc.id::text
      LEFT JOIN qa_todo_modules ptc_m ON ptc.module_id::text = ptc_m.id::text
      LEFT JOIN modules_v2 ptc_mv2 ON ptc.module_id::text = ptc_mv2.id::text
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

export const createTestSuite = async (req: Request, res: Response) => {
  await ensureModuleFkDropped();
  const client = await pool.connect();
  try {
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    
    const { suite_name, module_id, parent_test_case_id, parent_id, description, test_case_ids } = req.body;
    const parentId = parent_test_case_id || parent_id || null;
    
    await client.query('BEGIN');
    
    // Create Suite
    const { rows: suiteRows } = await client.query(
      `INSERT INTO qa_test_suites (tenant_id, suite_name, module_id, parent_test_case_id, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [tenantId, suite_name, module_id || null, parentId, description, userId]
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
    const { suite_name, module_id, parent_test_case_id, parent_id, description, test_case_ids } = req.body;
    const parentId = parent_test_case_id || parent_id || null;
    
    await client.query('BEGIN');
    
    const { rows: suiteRows } = await client.query(
      `UPDATE qa_test_suites SET 
        suite_name = $1, module_id = $2, parent_test_case_id = COALESCE($3, parent_test_case_id), description = $4, updated_by = $5, updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7 RETURNING *`,
      [suite_name, module_id || null, parentId, description, userId, id, tenantId]
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
