// src/modules/leave-v2/repositories/adjustment.repo.ts
//
// Manual balance adjustments are plain ledger entries with source =
// 'manual_adjustment'. The ledger is append-only — corrections are new
// compensating entries, never edits/deletes.

import { TenantClient } from '../db/pool';

export interface AdjustmentRow {
  id: string;
  userId: string;
  leaveTypeId: string;
  entryType: string;
  units: number;
  note: string | null;
  effectiveDate: string;
  createdBy: string | null;
  createdAt: Date;
  // joined
  leaveTypeName: string;
  leaveTypeColor: string | null;
  userName: string;
  userEmail: string | null;
  userAvatarUrl: string | null;
}

const SELECT_ADJ = `
  lg.id, lg.user_id, lg.leave_type_id, lg.entry_type, lg.units, lg.note,
  to_char(lg.effective_date, 'YYYY-MM-DD') AS effective_date, lg.created_by, lg.created_at,
  lt.name AS leave_type_name, lt.color AS leave_type_color,
  u.name AS user_name, u.work_email AS user_email, u.avatar_url AS user_avatar_url
`;

function mapAdj(r: any): AdjustmentRow {
  return {
    id: r.id,
    userId: r.user_id,
    leaveTypeId: r.leave_type_id,
    entryType: r.entry_type,
    units: Number(r.units),
    note: r.note,
    effectiveDate: r.effective_date,
    createdBy: r.created_by,
    createdAt: r.created_at,
    leaveTypeName: r.leave_type_name,
    leaveTypeColor: r.leave_type_color,
    userName: r.user_name || '—',
    userEmail: r.user_email ?? null,
    userAvatarUrl: r.user_avatar_url ?? null,
  };
}

export interface InsertEntryData {
  userId: string;
  leaveTypeId: string;
  entryType: string;
  units: number; // signed
  note: string;
  effectiveDate: string;
  createdBy: string;
}

export async function insertEntry(client: TenantClient, d: InsertEntryData): Promise<AdjustmentRow> {
  const { rows } = await client.query(
    `WITH ins AS (
       INSERT INTO lv2_leave_ledger
         (tenant_id, user_id, leave_type_id, entry_type, units, source, note, effective_date, created_by)
       VALUES ($1, $2, $3, $4, $5, 'manual_adjustment', $6, $7, $8)
       RETURNING *
     )
     SELECT ${SELECT_ADJ}
       FROM ins lg
       JOIN lv2_leave_types lt ON lt.id = lg.leave_type_id
       JOIN users u ON u.id = lg.user_id::text`,
    [client.tenantId, d.userId, d.leaveTypeId, d.entryType, d.units, d.note, d.effectiveDate, d.createdBy]
  );
  return mapAdj(rows[0]);
}

export async function listAdjustments(client: TenantClient): Promise<AdjustmentRow[]> {
  const { rows } = await client.query(
    `SELECT ${SELECT_ADJ}
       FROM lv2_leave_ledger lg
       JOIN lv2_leave_types lt ON lt.id = lg.leave_type_id
       JOIN users u ON u.id = lg.user_id::text
      WHERE lg.tenant_id = $1 AND lg.source = 'manual_adjustment'
      ORDER BY lg.created_at DESC`,
    [client.tenantId]
  );
  return rows.map(mapAdj);
}

export interface EmployeeOption {
  value: string;
  label: string;
  code: string | null;
  avatarUrl: string | null;
}

/** All active users — option `value` is the user id (the ledger's person key). */
export async function listEmployees(client: TenantClient): Promise<EmployeeOption[]> {
  const { rows } = await client.query(
    `SELECT u.id AS value, u.name AS label, u.work_email AS code, u.avatar_url AS avatar_url
       FROM users u
      WHERE u.tenant_id = $1 AND u.is_active = true
      ORDER BY u.name`,
    [client.tenantId]
  );
  return rows.map((r) => ({ value: r.value, label: r.label || '—', code: r.code ?? null, avatarUrl: r.avatar_url ?? null }));
}

/**
 * Hard-delete a manual adjustment ledger row. Restricted to
 * source = 'manual_adjustment' so system entries (accruals, leave-request
 * debits) can never be removed. Balance is SUM(units), so dropping the row
 * automatically reverses its effect. Returns true if a row was deleted.
 */
export async function deleteEntry(client: TenantClient, id: string): Promise<AdjustmentRow | null> {
  const { rows } = await client.query(
    `WITH del AS (
       DELETE FROM lv2_leave_ledger
        WHERE tenant_id = $1 AND id = $2 AND source = 'manual_adjustment'
        RETURNING *
     )
     SELECT ${SELECT_ADJ}
       FROM del lg
       JOIN lv2_leave_types lt ON lt.id = lg.leave_type_id
       JOIN users u ON u.id = lg.user_id::text`,
    [client.tenantId, id]
  );
  return rows[0] ? mapAdj(rows[0]) : null;
}

export async function getBalanceFor(client: TenantClient, userId: string, leaveTypeId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(units), 0) AS available
       FROM lv2_leave_ledger
      WHERE tenant_id = $1 AND user_id = $2 AND leave_type_id = $3`,
    [client.tenantId, userId, leaveTypeId]
  );
  return Number(rows[0].available);
}
