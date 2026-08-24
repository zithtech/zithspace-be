import { Request, Response } from 'express';
import pool from '../config/dbpool';
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from '../utils/transactionHistory';

export const getModules = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized: No tenant found' });

    // Fetch from modules_v2 using the name column.
    // We alias name as module_name so the frontend doesn't break.
    const { rows } = await pool.query(
      `SELECT id, name as module_name, description FROM modules_v2 WHERE is_active = true ORDER BY sort_order ASC`
    );
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const createModule = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    
    const { module_name, description } = req.body;
    
    const { rows } = await pool.query(
      `INSERT INTO qa_todo_modules (tenant_id, module_name, description) 
       VALUES ($1, $2, $3) RETURNING *`,
      [tenantId, module_name, description]
    );

    const newModule = rows[0];

    recordTransaction({
      req: req as any,
      section: Section.WORK,
      module: Module.QA_WORKSPACE,
      page: Page.QA_MODULE_LIST,
      action: Action.CREATE,
      actionLabel: "QA Module created",
      entityType: EntityType.QA_MODULE,
      entityId: newModule.id,
      entityLabel: newModule.module_name,
      afterData: newModule,
    });

    res.status(201).json({ success: true, data: newModule });
  } catch (error) {
    console.error('Error creating module:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const updateModule = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.params;
    const { module_name, description } = req.body;
    
    const { rows: oldRows } = await pool.query(
      `SELECT * FROM qa_todo_modules WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (!oldRows.length) return res.status(404).json({ success: false, error: 'Not found' });
    const oldModule = oldRows[0];

    const { rows } = await pool.query(
      `UPDATE qa_todo_modules SET module_name = $1, description = $2, updated_at = NOW() 
       WHERE id = $3 AND tenant_id = $4 RETURNING *`,
      [module_name, description, id, tenantId]
    );

    const updatedModule = rows[0];
    const diff = diffShallow(oldModule, updatedModule);
    if (diff.changedFields.length > 0) {
      recordTransaction({
        req: req as any,
        section: Section.WORK,
        module: Module.QA_WORKSPACE,
        page: Page.QA_MODULE_LIST,
        action: Action.UPDATE,
        actionLabel: "QA Module updated",
        entityType: EntityType.QA_MODULE,
        entityId: updatedModule.id,
        entityLabel: updatedModule.module_name,
        beforeData: diff.before,
        afterData: diff.after,
        changedFields: diff.changedFields,
      });
    }

    res.status(200).json({ success: true, data: updatedModule });
  } catch (error) {
    console.error('Error updating module:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const deleteModule = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.params;
    
    const { rows: oldRows } = await pool.query(
      `SELECT * FROM qa_todo_modules WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    
    if (oldRows.length > 0) {
      const oldModule = oldRows[0];
      await pool.query(`DELETE FROM qa_todo_modules WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
      
      recordTransaction({
        req: req as any,
        section: Section.WORK,
        module: Module.QA_WORKSPACE,
        page: Page.QA_MODULE_LIST,
        action: Action.DELETE,
        actionLabel: "QA Module deleted",
        entityType: EntityType.QA_MODULE,
        entityId: oldModule.id,
        entityLabel: oldModule.module_name,
        beforeData: oldModule,
      });
    }

    res.status(200).json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting module:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};
