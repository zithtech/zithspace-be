import { Request, Response } from 'express';
import pool from '../config/dbpool';

export const getTestRuns = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    
    const { suite_id, search, limit } = req.query;
    
    let query = `
      SELECT tr.*, ts.suite_name as suite_name,
      (SELECT COUNT(*) FROM qa_test_run_results trr WHERE trr.test_run_id = tr.id AND trr.status = 'Pass') as passed_count,
      (SELECT COUNT(*) FROM qa_test_run_results trr WHERE trr.test_run_id = tr.id AND trr.status = 'Fail') as failed_count,
      (SELECT COUNT(*) FROM qa_test_run_results trr WHERE trr.test_run_id = tr.id AND trr.status = 'Blocked') as blocked_count,
      (SELECT COUNT(*) FROM qa_test_run_results trr WHERE trr.test_run_id = tr.id AND trr.status = 'Not Executed') as not_executed_count,
      (SELECT COUNT(*) FROM qa_test_run_results trr WHERE trr.test_run_id = tr.id) as total_cases
      FROM qa_test_runs tr
      LEFT JOIN qa_test_suites ts ON tr.suite_id = ts.id
      WHERE tr.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    
    if (suite_id) {
      params.push(suite_id);
      query += ` AND tr.suite_id = $${params.length}`;
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
    
    const { rows: runRows } = await pool.query(`
      SELECT tr.*, ts.suite_name
      FROM qa_test_runs tr
      LEFT JOIN qa_test_suites ts ON tr.suite_id = ts.id
      WHERE tr.id = $1 AND tr.tenant_id = $2
    `, [id, tenantId]);
    if (!runRows.length) return res.status(404).json({ success: false, error: 'Test Run not found' });
    
    const run = runRows[0];
    
    // Fetch execution results
    const { rows: resultRows } = await pool.query(`
      SELECT trr.*, tc.test_case_id as tc_ref_id, tc.name, tc.priority, tc.test_type
      FROM qa_test_run_results trr
      JOIN qa_test_cases tc ON trr.test_case_id = tc.id
      WHERE trr.test_run_id = $1 AND trr.tenant_id = $2
      ORDER BY tc.test_case_id ASC
    `, [id, tenantId]);
    
    run.results = resultRows;
    
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
    
    const { run_name, suite_id, execution_type } = req.body;
    
    await client.query('BEGIN');
    
    // Create Run
    const { rows: runRows } = await client.query(
      `INSERT INTO qa_test_runs (tenant_id, run_name, suite_id, execution_type, executed_by, started_at)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [tenantId, run_name, suite_id, execution_type || null, userId]
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
    
    const { rows } = await pool.query(
      `UPDATE qa_test_run_results SET 
        status = $1, notes = $2, executed_at = NOW(), updated_at = NOW()
       WHERE id = $3 AND test_run_id = $4 AND tenant_id = $5 RETURNING *`,
      [status, notes, resultId, runId, tenantId]
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
