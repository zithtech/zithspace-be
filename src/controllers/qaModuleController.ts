import { Request, Response } from 'express';
import pool from '../config/dbpool';
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from '../utils/transactionHistory';

/**
 * QA modules are tenant-owned and project-owned: a workspace curates its own
 * list in QA Space → Settings → Modules, every module names the project it
 * belongs to, and everything in QA Space is filed under one.
 *
 * `modules_v2` — the product's own module catalogue — is deliberately NOT
 * listed here. It is Zukvo's navigation metadata, shared across tenants, and a
 * tenant's QA modules have nothing to do with it. Older records may still point
 * at a catalogue id; the case and suite queries COALESCE across both tables, so
 * those keep resolving a name even though the catalogue is not offered here.
 */

/** A module's project. `id` is null when a scope named a product we can't match. */
interface ResolvedProject {
  id: string | null;
  name: string;
}

/**
 * Test scopes store their product as a *name* (`details.product`), while the
 * settings screen sends the project's id. Accept either and answer with both,
 * so a module always carries a readable project even when the id is unknown.
 */
const resolveProject = async (
  tenantId: string,
  projectId: any,
  projectName: any,
): Promise<ResolvedProject | null> => {
  const id = String(projectId ?? '').trim();
  const name = String(projectName ?? '').trim();
  if (!id && !name) return null;

  const { rows } = await pool.query(
    `SELECT id, name
       FROM projects
      WHERE tenant_id = $1::text
        AND (($2::text <> '' AND id = $2::text)
             OR ($3::text <> '' AND LOWER(name) = LOWER($3::text)))
      LIMIT 1`,
    [tenantId, id, name],
  );
  if (rows.length) return { id: rows[0].id, name: rows[0].name };
  // A scope may name a product free-hand; keep the label rather than losing it.
  return name ? { id: null, name } : null;
};

/**
 * Registers module names typed elsewhere in QA Space — today, the modules a
 * test scope names in `details.modules`. A scope and the module list are meant
 * to be the same list, so naming a module on a scope adds it here immediately,
 * filed under the scope's own product. Case-insensitive: "Billing" and
 * "billing" are one module.
 */
export const registerModuleNames = async (tenantId: string, names: any, product?: any) => {
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

  const project = await resolveProject(tenantId, null, product);

  // A module registered before projects existed (or from a scope with no
  // product) is adopted by the first scope that does name one, rather than
  // being duplicated alongside it.
  if (project) {
    await pool.query(
      `UPDATE qa_todo_modules m
          SET project_id = $3::text, project_name = $4::text, updated_at = NOW()
         FROM UNNEST($2::text[]) AS t(name)
        WHERE m.tenant_id = $1
          AND LOWER(m.module_name) = LOWER(t.name)
          AND m.project_id IS NULL
          AND m.project_name IS NULL`,
      [tenantId, unique, project.id, project.name],
    );
  }

  await pool.query(
    `INSERT INTO qa_todo_modules (tenant_id, module_name, project_id, project_name)
     SELECT $1, t.name, $3::text, $4::text
       FROM UNNEST($2::text[]) AS t(name)
      WHERE NOT EXISTS (
        SELECT 1 FROM qa_todo_modules m
         WHERE m.tenant_id = $1
           AND LOWER(m.module_name) = LOWER(t.name)
           AND (
             m.project_id IS NOT DISTINCT FROM $3::text
             OR ($3::text IS NULL AND $4::text IS NULL)
             OR LOWER(COALESCE(m.project_name, '')) = LOWER(COALESCE($4::text, ''))
           )
      )`,
    [tenantId, unique, project?.id ?? null, project?.name ?? null],
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
      // $1 is the tenant as a uuid (the qa_* tables), $2 the same id as text
      // (`projects` is Prisma-owned and keys on text).
      `INSERT INTO qa_todo_modules (tenant_id, module_name, project_id, project_name)
       SELECT DISTINCT ON (LOWER(TRIM(m.name)), LOWER(COALESCE(NULLIF(TRIM(s.details ->> 'product'), ''), '')))
              $1,
              TRIM(m.name),
              (SELECT p.id FROM projects p
                WHERE p.tenant_id = $2::text
                  AND LOWER(p.name) = LOWER(TRIM(s.details ->> 'product'))
                LIMIT 1),
              NULLIF(TRIM(s.details ->> 'product'), '')
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
        ORDER BY LOWER(TRIM(m.name)),
                 LOWER(COALESCE(NULLIF(TRIM(s.details ->> 'product'), ''), ''))`,
      [tenantId, tenantId],
    );
  } catch (error) {
    // A failed backfill must not cost the caller their module list.
    console.error('Failed to adopt scope modules:', error);
    backfilled.delete(tenantId);
  }
};

/**
 * Test scopes name their modules as free text in `details.modules`, so a link
 * is a name match. When both sides name a product they have to agree, or a
 * "Billing" module in one project would look busy because another project's
 * scope mentions Billing.
 */
const SCOPE_LINK_PREDICATE = `
  ts.tenant_id = $1
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(ts.details -> 'modules') = 'array'
           THEN ts.details -> 'modules'
           ELSE '[]'::jsonb END
    ) AS sm(name)
     WHERE LOWER(TRIM(sm.name)) = LOWER($2)
  )
  AND (
    $3::text IS NULL
    OR COALESCE(NULLIF(TRIM(ts.details ->> 'product'), ''), '') = ''
    OR LOWER(TRIM(ts.details ->> 'product')) = LOWER($3::text)
  )
`;

/** The scopes standing between a module and its delete button. */
const linkedScopes = async (tenantId: string, moduleName: string, projectName: string | null) => {
  const { rows } = await pool.query(
    `SELECT ts.id, ts.name, ts.status
       FROM qa_test_scopes ts
      WHERE ${SCOPE_LINK_PREDICATE}
      ORDER BY ts.updated_at DESC NULLS LAST
      LIMIT 50`,
    [tenantId, moduleName, projectName],
  );
  return rows;
};

/** How many QA records point at a module — used before allowing a delete. */
const USAGE_SQL = `
  (SELECT COUNT(*) FROM qa_parent_test_cases p WHERE p.module_id::text = src.id::text) AS case_count,
  (SELECT COUNT(*) FROM qa_test_suites s WHERE s.module_id::text = src.id::text) AS suite_count,
  (SELECT COUNT(*)
     FROM qa_test_scopes ts
    WHERE ts.tenant_id = src.tenant_id
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(ts.details -> 'modules') = 'array'
               THEN ts.details -> 'modules'
               ELSE '[]'::jsonb END
        ) AS sm(name)
         WHERE LOWER(TRIM(sm.name)) = LOWER(src.module_name)
      )
      AND (
        src.project_name IS NULL
        OR COALESCE(NULLIF(TRIM(ts.details ->> 'product'), ''), '') = ''
        OR LOWER(TRIM(ts.details ->> 'product')) = LOWER(src.project_name)
      )) AS scope_count
`;

export const getModules = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized: No tenant found' });

    await backfillFromScopes(tenantId);

    const projectId = String(req.query.project_id ?? '').trim();

    // `module_name` is the alias every existing dropdown reads.
    const { rows } = await pool.query(
      `SELECT src.id, src.module_name, src.description,
              src.project_id, src.project_name,
              src.created_at, src.updated_at,
              ${USAGE_SQL}
         FROM qa_todo_modules src
        WHERE src.tenant_id = $1
          AND ($2::text = '' OR src.project_id = $2::text)
        ORDER BY src.project_name ASC NULLS FIRST, src.module_name ASC`,
      [tenantId, projectId],
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

/**
 * A module is meaningless without the product it belongs to, so the project is
 * required on write. It must be one of the tenant's own projects.
 */
const requireProject = async (tenantId: string, body: any): Promise<ResolvedProject | string> => {
  const projectId = String(body?.project_id ?? '').trim();
  if (!projectId) return 'Project is required';
  const { rows } = await pool.query(
    `SELECT id, name FROM projects WHERE tenant_id = $1::text AND id = $2::text LIMIT 1`,
    [tenantId, projectId],
  );
  if (!rows.length) return 'That project does not exist in this workspace';
  return { id: rows[0].id, name: rows[0].name };
};

/**
 * Names only have to be unique inside a project — two products may each own a
 * "Billing" module. A module still sitting without a project counts as a clash
 * whichever project is chosen, because it is the same module waiting to be
 * filed; the caller is told to edit that one rather than add a second.
 *
 * Returns the refusal to send, or null when the name is free.
 */
const nameClash = async (
  tenantId: string,
  moduleName: string,
  projectId: string | null,
  excludeId: string | null,
): Promise<string | null> => {
  const { rows } = await pool.query(
    `SELECT project_id FROM qa_todo_modules
      WHERE tenant_id = $1
        AND LOWER(module_name) = LOWER($2)
        AND (project_id = $3::text OR project_id IS NULL)
        AND ($4::text IS NULL OR id::text <> $4::text)
      ORDER BY project_id NULLS LAST
      LIMIT 1`,
    [tenantId, moduleName, projectId, excludeId],
  );
  if (!rows.length) return null;
  return rows[0].project_id
    ? 'That project already has a module with this name'
    : `A module named "${moduleName}" already exists without a project — edit that one to file it under this project`;
};

export const createModule = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const module_name = String(req.body?.module_name ?? '').trim();
    const description = req.body?.description ? String(req.body.description).trim() : null;
    if (!module_name) return res.status(400).json({ success: false, error: 'Module name is required' });

    const project = await requireProject(tenantId, req.body);
    if (typeof project === 'string') return res.status(400).json({ success: false, error: project });

    const clash = await nameClash(tenantId, module_name, project.id, null);
    if (clash) return res.status(409).json({ success: false, error: clash });

    const { rows } = await pool.query(
      `INSERT INTO qa_todo_modules (tenant_id, module_name, description, project_id, project_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tenantId, module_name, description, project.id, project.name],
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

    const project = await requireProject(tenantId, req.body);
    if (typeof project === 'string') return res.status(400).json({ success: false, error: project });

    const clash = await nameClash(tenantId, module_name, project.id, id);
    if (clash) return res.status(409).json({ success: false, error: clash });

    const { rows: oldRows } = await pool.query(
      `SELECT * FROM qa_todo_modules WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (!oldRows.length) return res.status(404).json({ success: false, error: 'Not found' });
    const oldModule = oldRows[0];

    const { rows } = await pool.query(
      `UPDATE qa_todo_modules
          SET module_name = $1, description = $2, project_id = $3, project_name = $4, updated_at = NOW()
        WHERE id = $5 AND tenant_id = $6 RETURNING *`,
      [module_name, description, project.id, project.name, id, tenantId],
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

    const { rows: owned } = await pool.query(
      `SELECT module_name, project_name FROM qa_todo_modules WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (!owned.length) return res.status(404).json({ success: false, error: 'Not found' });

    // A module named by a test scope is part of that scope's plan — deleting it
    // would leave the scope pointing at something the workspace no longer has.
    const scopes = await linkedScopes(tenantId, owned[0].module_name, owned[0].project_name ?? null);
    if (scopes.length) {
      return res.status(409).json({
        success: false,
        error: `Linked to ${scopes.length} test scope${scopes.length === 1 ? '' : 's'} — remove it from ${scopes.length === 1 ? 'that scope' : 'those scopes'} first`,
        scopes: scopes.map((s: any) => ({ id: s.id, name: s.name, status: s.status })),
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
    res.status(200).json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting module:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};
