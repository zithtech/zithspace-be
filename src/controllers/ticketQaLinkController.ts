import { Request, Response } from 'express';
import pool from '../config/dbpool';
import { recordTransaction, Section, Module, Page, Action, EntityType } from '../utils/transactionHistory';

/**
 * QA links on a ticket — the QA team attaches test scopes, business scenarios
 * (parent test cases) and test runs to a ticket, and PMs open them from the
 * ticket drawer without needing the QA workspace filters.
 *
 * The QA tables live outside Prisma (raw SQL, see src/scripts/createTestCaseTables.ts),
 * so this link table is created/queried the same way.
 */

export type QaEntityType = 'scope' | 'case' | 'run';

const ENTITY_TYPES: QaEntityType[] = ['scope', 'case', 'run'];

let tableReady = false;
const ensureTable = async () => {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_qa_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      entity_type VARCHAR(20) NOT NULL,
      entity_id UUID NOT NULL,
      linked_by_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ticket_qa_links_unique
      ON ticket_qa_links (ticket_id, entity_type, entity_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ticket_qa_links_tenant_ticket
      ON ticket_qa_links (tenant_id, ticket_id);
  `);
  tableReady = true;
};

/**
 * Names/status are read through to the QA tables at query time so a renamed
 * scope or a run that moved to Passed stays accurate on the ticket. Rows whose
 * QA record was deleted are dropped from the result (LEFT JOIN + filter) rather
 * than shown as blanks.
 */
const LINKS_QUERY = `
  SELECT l.id,
         l.entity_type,
         l.entity_id,
         l.created_at,
         u.name AS linked_by_name,
         COALESCE(s.name, ptc.title, tr.run_name) AS name,
         COALESCE(s.status, ptc.status, tr.status) AS status,
         COALESCE(s.type, COALESCE(mv2.name, m.module_name), ts.suite_name) AS subtitle
  FROM ticket_qa_links l
  LEFT JOIN users u ON l.linked_by_id = u.id
  LEFT JOIN qa_test_scopes s ON l.entity_type = 'scope' AND l.entity_id = s.id
  LEFT JOIN qa_parent_test_cases ptc ON l.entity_type = 'case' AND l.entity_id = ptc.id
  LEFT JOIN qa_todo_modules m ON ptc.module_id::text = m.id::text
  LEFT JOIN modules_v2 mv2 ON ptc.module_id::text = mv2.id::text
  LEFT JOIN qa_test_runs tr ON l.entity_type = 'run' AND l.entity_id = tr.id
  LEFT JOIN qa_test_suites ts ON tr.suite_id = ts.id
  WHERE l.ticket_id = $1
    AND l.tenant_id = $2
    AND COALESCE(s.id, ptc.id, tr.id) IS NOT NULL
  ORDER BY l.created_at DESC
`;

/**
 * The QA record a link points at must belong to the caller's tenant — the id
 * arrives from the client, so a cross-tenant id would otherwise leak a name.
 */
const TABLE_BY_TYPE: Record<QaEntityType, string> = {
  scope: 'qa_test_scopes',
  case: 'qa_parent_test_cases',
  run: 'qa_test_runs',
};

export const getTicketQaLinks = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    await ensureTable();
    const { id } = req.params;

    const { rows } = await pool.query(LINKS_QUERY, [id, tenantId]);
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching ticket QA links:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch QA links' });
  }
};

export const addTicketQaLink = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    await ensureTable();
    const { id } = req.params;
    const entityType = req.body?.entityType as QaEntityType;
    const entityId = req.body?.entityId as string;

    if (!ENTITY_TYPES.includes(entityType) || !entityId) {
      return res.status(400).json({
        success: false,
        error: 'entityType (scope | case | run) and entityId are required',
      });
    }

    const ticket = await pool.query(
      `SELECT id FROM tickets WHERE id = $1 AND tenant_id = $2 AND COALESCE(is_deleted, false) = false`,
      [id, tenantId]
    );
    if (ticket.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const entity = await pool.query(
      `SELECT id FROM ${TABLE_BY_TYPE[entityType]} WHERE id = $1 AND tenant_id::text = $2`,
      [entityId, tenantId]
    );
    if (entity.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'QA record not found' });
    }

    // Re-linking something already on the ticket is a no-op, not an error.
    const result = await pool.query(
      `INSERT INTO ticket_qa_links (tenant_id, ticket_id, entity_type, entity_id, linked_by_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (ticket_id, entity_type, entity_id) DO NOTHING RETURNING *`,
      [tenantId, id, entityType, entityId, userId || null]
    );

    if (result.rowCount && result.rowCount > 0) {
      recordTransaction({
        req: req as any,
        section: Section.WORK,
        module: Module.TICKETS,
        page: Page.TICKET_DETAIL,
        action: Action.CREATE,
        actionLabel: `QA ${entityType} linked`,
        entityType: EntityType.TICKET_QA_LINK,
        entityId: result.rows[0].id,
        parentEntityType: EntityType.TICKET,
        parentEntityId: id,
        afterData: result.rows[0],
      });
    }

    const { rows } = await pool.query(LINKS_QUERY, [id, tenantId]);
    return res.status(201).json({ success: true, data: rows });
  } catch (error) {
    console.error('Error adding ticket QA link:', error);
    return res.status(500).json({ success: false, error: 'Failed to link QA record' });
  }
};

export const deleteTicketQaLink = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    await ensureTable();
    const { ticketId, linkId } = req.params;

    const { rows: oldRows } = await pool.query(
      `SELECT * FROM ticket_qa_links WHERE id = $1 AND ticket_id = $2 AND tenant_id = $3`,
      [linkId, ticketId, tenantId]
    );

    if (oldRows.length === 0) {
      return res.status(404).json({ success: false, error: 'QA link not found' });
    }
    
    const oldLink = oldRows[0];

    await pool.query(
      `DELETE FROM ticket_qa_links WHERE id = $1 AND ticket_id = $2 AND tenant_id = $3`,
      [linkId, ticketId, tenantId]
    );

    recordTransaction({
      req: req as any,
      section: Section.WORK,
      module: Module.TICKETS,
      page: Page.TICKET_DETAIL,
      action: Action.DELETE,
      actionLabel: `QA ${oldLink.entity_type} unlinked`,
      entityType: EntityType.TICKET_QA_LINK,
      entityId: linkId,
      parentEntityType: EntityType.TICKET,
      parentEntityId: ticketId,
      beforeData: oldLink,
    });

    return res.status(200).json({ success: true, message: 'QA link removed' });
  } catch (error) {
    console.error('Error deleting ticket QA link:', error);
    return res.status(500).json({ success: false, error: 'Failed to remove QA link' });
  }
};
