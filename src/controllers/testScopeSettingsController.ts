import { Request, Response } from 'express';
import pool from '../config/dbpool';
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from '../utils/transactionHistory';


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

    const category = String(req.query.category ?? '').trim();
    const search = String(req.query.search ?? req.query.q ?? '').trim();

    let whereClause = `WHERE tenant_id = $1`;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (category) {
      params.push(category);
      whereClause += ` AND category = $${paramIndex}`;
      paramIndex++;
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      whereClause += ` AND (LOWER(label) LIKE $${paramIndex} OR LOWER(value) LIKE $${paramIndex})`;
      paramIndex++;
    }

    const hasPagination = req.query.page !== undefined || req.query.pageSize !== undefined || req.query.limit !== undefined;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.max(1, parseInt((req.query.pageSize || req.query.limit) as string, 10) || 15);

    let total = 0;
    if (hasPagination) {
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total FROM qa_scope_settings ${whereClause}`,
        params
      );
      total = countRes.rows[0]?.total ?? 0;
    }

    let query = `SELECT * FROM qa_scope_settings ${whereClause} ORDER BY category, sort_order, created_at ASC`;

    const queryParams = [...params];
    if (hasPagination) {
      queryParams.push(pageSize, (page - 1) * pageSize);
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    }

    const { rows } = await pool.query(query, queryParams);

    if (hasPagination) {
      res.json({
        success: true,
        data: rows,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      });
    } else {
      res.json({ success: true, data: rows });
    }
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Internal Server Error', details: err.message });
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

    recordTransaction({
      req: req as any,
      section: Section.WORK,
      module: Module.QA_WORKSPACE,
      page: Page.QA_SETTINGS,
      action: Action.CREATE,
      actionLabel: "QA Scope Setting created",
      entityType: EntityType.QA_SETTINGS,
      entityId: rows[0].id,
      entityLabel: label,
      afterData: rows[0],
    });

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

    const { rows: oldRows } = await pool.query(`SELECT * FROM qa_scope_settings WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
    if (!oldRows.length) return res.status(404).json({ success: false, error: 'Not found' });
    const oldSetting = oldRows[0];

    const { rows } = await pool.query(
      `UPDATE qa_scope_settings SET value=$1, label=$2, color=$3, sort_order=$4
       WHERE id=$5 AND tenant_id=$6 RETURNING *`,
      [value, label, color || null, sort_order ?? 0, id, tenantId]
    );

    if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });

    const updatedSetting = rows[0];
    const diff = diffShallow(oldSetting, updatedSetting);
    if (diff.changedFields.length > 0) {
      recordTransaction({
        req: req as any,
        section: Section.WORK,
        module: Module.QA_WORKSPACE,
        page: Page.QA_SETTINGS,
        action: Action.UPDATE,
        actionLabel: "QA Scope Setting updated",
        entityType: EntityType.QA_SETTINGS,
        entityId: id,
        entityLabel: updatedSetting.label,
        beforeData: diff.before,
        afterData: diff.after,
        changedFields: diff.changedFields,
      });
    }

    res.json({ success: true, data: updatedSetting });
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

    const { rows: oldRows } = await pool.query(`SELECT * FROM qa_scope_settings WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
    if (!oldRows.length) return res.status(404).json({ success: false, error: 'Not found' });
    const oldSetting = oldRows[0];

    const { rows } = await pool.query(
      `DELETE FROM qa_scope_settings WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [id, tenantId]
    );

    if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });

    recordTransaction({
      req: req as any,
      section: Section.WORK,
      module: Module.QA_WORKSPACE,
      page: Page.QA_SETTINGS,
      action: Action.DELETE,
      actionLabel: "QA Scope Setting deleted",
      entityType: EntityType.QA_SETTINGS,
      entityId: id,
      entityLabel: oldSetting.label,
      beforeData: oldSetting,
    });

    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};
