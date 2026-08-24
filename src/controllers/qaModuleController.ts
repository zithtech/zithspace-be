import { Request, Response } from 'express';
import pool from '../config/dbpool';
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from '../utils/transactionHistory';

/**
 * QA modules are tenant-owned: a workspace curates its own list in
 * QA Space → Settings → Modules, and everything in QA Space is filed under one.
 *
 * `modules_v2` — the product's own module catalogue — is deliberately NOT
 * listed here. It is Zukvo's navigation metadata, shared across tenants, and a
 * tenant's QA modules have nothing to do with it. Older records may still point
 * at a catalogue id; the case and suite queries COALESCE across both tables, so
 * those keep resolving a name even though the catalogue is not offered here.
 */

/**
 * Registers module names typed elsewhere in QA Space — today, the modules a
 * test scope names in `details.modules`. A scope and the module list are meant
 * to be the same list, so naming a module on a scope adds it here immediately.
 * Case-insensitive: "Billing" and "billing" are one module.
 */
export const registerModuleNames = async (tenantId: string, names: any) => {
  const list = Array.isArray(names) ? names : [];
  const unique = Array.from(
    new Map(
      list
        .map((n: any) => String(n ?? '').trim())
        .filter(Boolean)
        .map((n: string) => [n.toLowerCase(), n]),
    ).values(),
  );
  if (!unique.length) return;

  await pool.query(
    `INSERT INTO qa_todo_modules (tenant_id, module_name)
     SELECT $1, t.name
       FROM UNNEST($2::text[]) AS t(name)
      WHERE NOT EXISTS (
        SELECT 1 FROM qa_todo_modules m
         WHERE m.tenant_id = $1 AND LOWER(m.module_name) = LOWER(t.name)
      )`,
    [tenantId, unique],
  );
};

/**
 * Scopes created before modules were registered on save still name modules that
 * were never added to the list. The first module read per tenant adopts them,
 * so the two lists line up without anyone having to retype anything.
 */
const backfilled = new Set<string>();
const backfillFromScopes = async (tenantId: string) => {
  if (backfilled.has(tenantId)) return;
  backfilled.add(tenantId);
  try {
    await pool.query(
      `INSERT INTO qa_todo_modules (tenant_id, module_name)
       SELECT DISTINCT ON (LOWER(TRIM(m.name))) $1, TRIM(m.name)
         FROM qa_test_scopes s
         CROSS JOIN LATERAL jsonb_array_elements_text(
           CASE WHEN jsonb_typeof(s.details -> 'modules') = 'array'
                THEN s.details -> 'modules'
                ELSE '[]'::jsonb END
         ) AS m(name)
        WHERE s.tenant_id = $1
          AND TRIM(m.name) <> ''
          AND NOT EXISTS (
            SELECT 1 FROM qa_todo_modules q
             WHERE q.tenant_id = $1 AND LOWER(q.module_name) = LOWER(TRIM(m.name))
          )
        ORDER BY LOWER(TRIM(m.name))`,
      [tenantId],
    );
  } catch (error) {
    // A failed backfill must not cost the caller their module list.
    console.error('Failed to adopt scope modules:', error);
    backfilled.delete(tenantId);
  }
};

/** How many QA records point at a module — used before allowing a delete. */
const USAGE_SQL = `
  (SELECT COUNT(*) FROM qa_parent_test_cases p WHERE p.module_id::text = src.id::text) AS case_count,
  (SELECT COUNT(*) FROM qa_test_suites s WHERE s.module_id::text = src.id::text) AS suite_count
`;

export const getModules = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized: No tenant found' });

    await backfillFromScopes(tenantId);

    // `module_name` is the alias every existing dropdown reads.
    const { rows } = await pool.query(
      `SELECT src.id, src.module_name, src.description, src.created_at, src.updated_at,
              ${USAGE_SQL}
         FROM qa_todo_modules src
        WHERE src.tenant_id = $1
        ORDER BY src.module_name ASC`,
      [tenantId],
    );
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

/** Catalogue modules belong to the platform, not to the tenant editing them. */
const isCatalogueModule = async (id: string) => {
  const { rows } = await pool.query(`SELECT 1 FROM modules_v2 WHERE id::text = $1::text`, [id]);
  return rows.length > 0;
};

export const createModule = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const module_name = String(req.body?.module_name ?? '').trim();
    const description = req.body?.description ? String(req.body.description).trim() : null;
    if (!module_name) return res.status(400).json({ success: false, error: 'Module name is required' });

    const { rows: clash } = await pool.query(
      `SELECT 1 FROM qa_todo_modules WHERE tenant_id = $1 AND LOWER(module_name) = LOWER($2)`,
      [tenantId, module_name],
    );
    if (clash.length) return res.status(409).json({ success: false, error: 'A module with that name already exists' });

    const { rows } = await pool.query(
      `INSERT INTO qa_todo_modules (tenant_id, module_name, description)
       VALUES ($1, $2, $3) RETURNING *`,
      [tenantId, module_name, description],
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
    if (await isCatalogueModule(id)) {
      return res.status(403).json({
        success: false,
        error: 'This module comes from the product catalogue and cannot be edited here',
      });
    }

    const module_name = String(req.body?.module_name ?? '').trim();
    const description = req.body?.description ? String(req.body.description).trim() : null;
    if (!module_name) return res.status(400).json({ success: false, error: 'Module name is required' });

    const { rows: clash } = await pool.query(
      `SELECT 1 FROM qa_todo_modules
        WHERE tenant_id = $1 AND LOWER(module_name) = LOWER($2) AND id::text <> $3::text`,
      [tenantId, module_name, id],
    );
    if (clash.length) return res.status(409).json({ success: false, error: 'A module with that name already exists' });

    const { rows: oldRows } = await pool.query(
      `SELECT * FROM qa_todo_modules WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (!oldRows.length) return res.status(404).json({ success: false, error: 'Not found' });
    const oldModule = oldRows[0];

    const { rows } = await pool.query(
      `UPDATE qa_todo_modules SET module_name = $1, description = $2, updated_at = NOW()
        WHERE id = $3 AND tenant_id = $4 RETURNING *`,
      [module_name, description, id, tenantId],
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

    if (await isCatalogueModule(id)) {
      return res.status(403).json({
        success: false,
        error: 'This module comes from the product catalogue and cannot be deleted here',
      });
    }

    // Deleting a module that scenarios or suites still point at would strand
    // them on an id that resolves to nothing.
    const { rows: usage } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM qa_parent_test_cases p WHERE p.module_id::text = $1::text)::int AS case_count,
         (SELECT COUNT(*) FROM qa_test_suites s WHERE s.module_id::text = $1::text)::int AS suite_count`,
      [id],
    );
    const inUse = (usage[0]?.case_count || 0) + (usage[0]?.suite_count || 0);
    if (inUse > 0) {
      return res.status(409).json({
        success: false,
        error: `${inUse} record${inUse === 1 ? '' : 's'} still use this module — reassign them first`,
      });
    }

    const { rows: oldRows } = await pool.query(
      `SELECT * FROM qa_todo_modules WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (!oldRows.length) return res.status(404).json({ success: false, error: 'Not found' });
    const oldModule = oldRows[0];

    const { rowCount } = await pool.query(
      `DELETE FROM qa_todo_modules WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (rowCount && rowCount > 0) {
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
