import { Request, Response } from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Import the existing pool logic. Instead of duplicating it, we'll initialize a pool here
// or use the global one. Let's recreate a lightweight instance pointing to DATABASE_URL.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const getTestScopes = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No tenant found' });
    }

    const { rows } = await pool.query(
      `SELECT * FROM qa_test_scopes WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );

    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching test scopes:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const createTestScope = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { name, type, priority, status, qa_owner, start_date, end_date, details } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO qa_test_scopes (tenant_id, name, type, priority, status, qa_owner, start_date, end_date, details) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [tenantId, name, type, priority, status, qa_owner, start_date || null, end_date || null, details || {}]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error creating test scope:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const updateTestScope = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const { id } = req.params;
    
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    console.log('UpdateTestScope called with id:', id, 'body:', req.body);
    const { name, type, priority, status, qa_owner, start_date, end_date, details } = req.body || {};

    const query = `UPDATE qa_test_scopes 
       SET name = $1, type = $2, priority = $3, status = $4, qa_owner = $5, start_date = $6, end_date = $7, details = $8, updated_at = NOW()
       WHERE id = $9 AND tenant_id = $10 RETURNING *`;
    
    const params = [
      name || null, 
      type || null, 
      priority || null, 
      status || null, 
      qa_owner || null, 
      start_date || null, 
      end_date || null, 
      details || {}, 
      id, 
      tenantId
    ];
    console.log('Executing query with params:', params);

    const { rows } = await pool.query(query, params);
    console.log('Update result rows:', rows.length);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Test Scope not found' });
    }

    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error updating test scope:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const deleteTestScope = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const { id } = req.params;
    
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { rows } = await pool.query(
      `DELETE FROM qa_test_scopes WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Test Scope not found' });
    }

    res.status(200).json({ success: true, message: 'Test scope deleted successfully' });
  } catch (error) {
    console.error('Error deleting test scope:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};
