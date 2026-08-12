// src/modules/opening-management/repositories/openingStatus.repo.ts
//
// Raw-SQL data access for the Phase 3 status lifecycle:
//   * the guarded status transition on om_openings
//   * the append-only om_opening_status_history timeline
//
// `appendHistory` is the ONLY writer of the history table — never update or
// delete a row there; corrections are new rows.

import { TenantClient } from '../db/pool';
import { OpeningStatus, StatusHistoryEntry } from '../types';

function mapHistory(r: any): StatusHistoryEntry {
  return {
    id: r.id,
    openingId: r.opening_id,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    reason: r.reason,
    note: r.note,
    isAutomated: r.is_automated,
    changedBy: r.changed_by,
    changedByName: r.changed_by_name ?? null,
    changedAt: r.changed_at,
  };
}

export interface HistoryData {
  openingId: string;
  fromStatus: OpeningStatus | null;
  toStatus: OpeningStatus;
  reason: string | null;
  note: string | null;
  isAutomated?: boolean;
  changedBy: string | null;
}

/** Append one transition to the timeline. */
export async function appendHistory(client: TenantClient, data: HistoryData): Promise<void> {
  await client.query(
    `INSERT INTO om_opening_status_history
       (tenant_id, opening_id, from_status, to_status, reason, note, is_automated, changed_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      client.tenantId,
      data.openingId,
      data.fromStatus,
      data.toStatus,
      data.reason,
      data.note,
      data.isAutomated ?? false,
      data.changedBy,
    ]
  );
}

export async function findHistory(
  client: TenantClient,
  openingId: string
): Promise<StatusHistoryEntry[]> {
  const { rows } = await client.query(
    `SELECT h.id, h.opening_id, h.from_status, h.to_status, h.reason, h.note,
            h.is_automated, h.changed_by, u.name AS changed_by_name, h.changed_at
       FROM om_opening_status_history h
       LEFT JOIN users u ON u.id = h.changed_by::text
      WHERE h.tenant_id = $1 AND h.opening_id = $2
      ORDER BY h.seq DESC`,
    [client.tenantId, openingId]
  );
  return rows.map(mapHistory);
}

/**
 * Move the opening to `toStatus`, but only if it is still in `fromStatus`.
 *
 * The `status = $4` guard makes this a compare-and-set: a concurrent transition
 * means this one affects 0 rows and the service reports a conflict instead of
 * silently overwriting someone else's move.
 *
 * Returns false when the opening had already moved on.
 */
export async function transition(
  client: TenantClient,
  openingId: string,
  fromStatus: OpeningStatus,
  toStatus: OpeningStatus,
  data: { reason: string | null; note: string | null; changedBy: string }
): Promise<boolean> {
  // closed_at marks when recruitment stopped; reopening clears it so a later
  // close records the new date rather than the stale one.
  const isTerminal = toStatus === 'closed' || toStatus === 'cancelled';

  const { rowCount } = await client.query(
    `UPDATE om_openings
        SET status = $4,
            status_reason = $5,
            status_note = $6,
            status_changed_at = now(),
            closed_at = CASE WHEN $7::boolean THEN now() ELSE NULL END,
            updated_by = $8,
            updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL AND status = $3`,
    [
      client.tenantId,
      openingId,
      fromStatus,
      toStatus,
      data.reason,
      data.note,
      isTerminal,
      data.changedBy,
    ]
  );
  return (rowCount ?? 0) > 0;
}

/**
 * The status an opening was in before its most recent hold — what "resume"
 * returns to. Null when it has never been held.
 */
export async function findStatusBeforeHold(
  client: TenantClient,
  openingId: string
): Promise<OpeningStatus | null> {
  const { rows } = await client.query<{ from_status: OpeningStatus | null }>(
    `SELECT from_status
       FROM om_opening_status_history
      WHERE tenant_id = $1 AND opening_id = $2 AND to_status = 'on_hold'
      ORDER BY seq DESC
      LIMIT 1`,
    [client.tenantId, openingId]
  );
  return rows[0]?.from_status ?? null;
}

/**
 * Counts by status for the tenant — the board/summary read.
 *
 * `archived` mirrors the list filter so the summary tiles and the table beneath
 * them count the same rows. A tile that disagrees with the list under it is
 * worse than no tile.
 */
export async function countByStatus(
  client: TenantClient,
  archived: 'exclude' | 'include' | 'only' = 'exclude'
): Promise<Record<string, number>> {
  const conditions = ['tenant_id = $1', 'deleted_at IS NULL'];
  if (archived === 'exclude') conditions.push('NOT is_archived');
  else if (archived === 'only') conditions.push('is_archived');

  const { rows } = await client.query<{ status: string; total: string }>(
    `SELECT status, COUNT(*)::text AS total
       FROM om_openings
      WHERE ${conditions.join(' AND ')}
      GROUP BY status`,
    [client.tenantId]
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = Number(r.total);
  return out;
}
