import { Request, Response } from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Ensure table exists
const ensureTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS qa_scope_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR NOT NULL,
      category VARCHAR NOT NULL,  -- 'scope_type' | 'priority' | 'status'
      value VARCHAR NOT NULL,
      label VARCHAR NOT NULL,
      color VARCHAR DEFAULT NULL,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
};

ensureTable().catch(console.error);

export const getScopeSettings = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { rows } = await pool.query(
      `SELECT * FROM qa_scope_settings WHERE tenant_id = $1 ORDER BY category, sort_order, created_at ASC`,
      [tenantId]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const createScopeSetting = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { category, value, label, color, sort_order } = req.body;
    if (!category || !value || !label) {
      return res.status(400).json({ success: false, error: 'category, value and label are required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO qa_scope_settings (tenant_id, category, value, label, color, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [tenantId, category, value, label, color || null, sort_order || 0]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const updateScopeSetting = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const { id } = req.params;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { value, label, color, sort_order } = req.body;

    const { rows } = await pool.query(
      `UPDATE qa_scope_settings SET value=$1, label=$2, color=$3, sort_order=$4
       WHERE id=$5 AND tenant_id=$6 RETURNING *`,
      [value, label, color || null, sort_order ?? 0, id, tenantId]
    );

    if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const deleteScopeSetting = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const { id } = req.params;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { rows } = await pool.query(
      `DELETE FROM qa_scope_settings WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [id, tenantId]
    );

    if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};
