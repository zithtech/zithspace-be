// src/modules/leave-v2/repositories/leaveRequest.repo.ts
//
// Raw-SQL data access for leave requests + balances (read from the ledger).
// Leave keys on user_id (the person). Every query is tenant-scoped.

import { TenantClient } from '../db/pool';

export interface LeaveRequestRow {
  id: string;
  userId: string;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  dayPortion: string;
  totalUnits: number;
  paidUnits: number;
  lopUnits: number;
  reason: string | null;
  status: string;
  approverId: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
  // joined
  leaveTypeName?: string;
  leaveTypeColor?: string | null;
  userName?: string;
  userEmail?: string;
  reportsToId?: string | null;
}

const SELECT_REQ = `
  r.id, r.user_id, r.leave_type_id,
  to_char(r.from_date, 'YYYY-MM-DD') AS from_date,
  to_char(r.to_date, 'YYYY-MM-DD')   AS to_date,
  r.day_portion,
  r.total_units, r.paid_units, r.lop_units, r.reason, r.status,
  r.approver_id, r.decided_at, r.decision_note, r.created_at,
  lt.name AS leave_type_name, lt.color AS leave_type_color
`;

// With requester info (for the approvals view).
const SELECT_REQ_EMP = `${SELECT_REQ}, u.name AS user_name, u.work_email AS user_email, u.reports_to_id AS reports_to_id`;

function mapReq(r: any): LeaveRequestRow {
  return {
    id: r.id,
    userId: r.user_id,
    leaveTypeId: r.leave_type_id,
    fromDate: r.from_date,
    toDate: r.to_date,
    dayPortion: r.day_portion,
    totalUnits: Number(r.total_units),
    paidUnits: Number(r.paid_units),
    lopUnits: Number(r.lop_units),
    reason: r.reason,
    status: r.status,
    approverId: r.approver_id,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
    createdAt: r.created_at,
    leaveTypeName: r.leave_type_name,
    leaveTypeColor: r.leave_type_color,
    userName: r.user_name ?? undefined,
    userEmail: r.user_email ?? undefined,
    reportsToId: r.reports_to_id ?? null,
  };
}

// ── Balances (derived from the ledger) ────────────────────────────────────────
export interface BalanceRow {
  leaveTypeId: string;
  available: number;
  credited: number;
  used: number;
}

export async function getBalances(client: TenantClient, userId: string): Promise<BalanceRow[]> {
  const { rows } = await client.query(
    `SELECT leave_type_id,
            COALESCE(SUM(units), 0)                          AS available,
            COALESCE(SUM(units) FILTER (WHERE units > 0), 0) AS credited,
            COALESCE(-SUM(units) FILTER (WHERE units < 0), 0) AS used
       FROM lv2_leave_ledger
      WHERE tenant_id = $1 AND user_id = $2
      GROUP BY leave_type_id`,
    [client.tenantId, userId]
  );
  return rows.map((r) => ({
    leaveTypeId: r.leave_type_id,
    available: Number(r.available),
    credited: Number(r.credited),
    used: Number(r.used),
  }));
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

// ── Requests ──────────────────────────────────────────────────────────────────
export async function overlapExists(
  client: TenantClient,
  userId: string,
  fromDate: string,
  toDate: string,
  excludeId?: string
): Promise<boolean> {
  const params: any[] = [client.tenantId, userId, fromDate, toDate];
  let sql = `SELECT 1 FROM lv2_leave_requests
              WHERE tenant_id = $1 AND user_id = $2
                AND status IN ('pending', 'approved')
                AND from_date <= $4 AND to_date >= $3`;
  if (excludeId) {
    params.push(excludeId);
    sql += ` AND id <> $5`;
  }
  sql += ' LIMIT 1';
  const { rowCount } = await client.query(sql, params);
  return rowCount > 0;
}

export interface InsertRequestData {
  userId: string;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  dayPortion: string;
  totalUnits: number;
  paidUnits: number;
  lopUnits: number;
  reason?: string | null;
  status: 'pending' | 'approved';
  approverId?: string | null;
  createdBy: string;
}

export async function insertRequest(client: TenantClient, d: InsertRequestData): Promise<LeaveRequestRow> {
  const decided = d.status === 'approved';
  const { rows } = await client.query(
    `WITH ins AS (
       INSERT INTO lv2_leave_requests
         (tenant_id, user_id, leave_type_id, from_date, to_date, day_portion,
          total_units, paid_units, lop_units, reason, status, approver_id,
          decided_at, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, ${decided ? 'now()' : 'NULL'}, $13, $13)
       RETURNING *
     )
     SELECT ${SELECT_REQ} FROM ins r JOIN lv2_leave_types lt ON lt.id = r.leave_type_id`,
    [
      client.tenantId, d.userId, d.leaveTypeId, d.fromDate, d.toDate, d.dayPortion,
      d.totalUnits, d.paidUnits, d.lopUnits, d.reason ?? null, d.status,
      decided ? d.approverId ?? d.createdBy : null, d.createdBy,
    ]
  );
  return mapReq(rows[0]);
}

export async function updateRequest(client: TenantClient, id: string, d: InsertRequestData): Promise<LeaveRequestRow> {
  const decided = d.status === 'approved';
  const { rows } = await client.query(
    `WITH upd AS (
       UPDATE lv2_leave_requests
          SET leave_type_id = $3, from_date = $4, to_date = $5, day_portion = $6,
              total_units = $7, paid_units = $8, lop_units = $9, reason = $10,
              status = $11, approver_id = $12, decided_at = ${decided ? 'now()' : 'NULL'},
              updated_by = $13, updated_at = now()
        WHERE tenant_id = $1 AND id = $2 AND status = 'pending'
        RETURNING *
     )
     SELECT ${SELECT_REQ} FROM upd r JOIN lv2_leave_types lt ON lt.id = r.leave_type_id`,
    [
      client.tenantId, id, d.leaveTypeId, d.fromDate, d.toDate, d.dayPortion,
      d.totalUnits, d.paidUnits, d.lopUnits, d.reason ?? null, d.status,
      decided ? d.approverId ?? d.createdBy : null, d.createdBy,
    ]
  );
  if (rows.length === 0) throw new Error('Update failed');
  return mapReq(rows[0]);
}

export async function listForUser(client: TenantClient, userId: string): Promise<LeaveRequestRow[]> {
  const { rows } = await client.query(
    `SELECT ${SELECT_REQ}
       FROM lv2_leave_requests r
       JOIN lv2_leave_types lt ON lt.id = r.leave_type_id
      WHERE r.tenant_id = $1 AND r.user_id = $2
      ORDER BY r.created_at DESC`,
    [client.tenantId, userId]
  );
  return rows.map(mapReq);
}

/** Cancel an own pending request. Returns true if a row changed. */
export async function cancelOwnPending(client: TenantClient, userId: string, id: string, actorId: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE lv2_leave_requests
        SET status = 'cancelled', updated_by = $4, updated_at = now()
      WHERE tenant_id = $1 AND user_id = $2 AND id = $3 AND status = 'pending'`,
    [client.tenantId, userId, id, actorId]
  );
  return rowCount > 0;
}

/** Write a ledger debit for an approved request (negative units). */
export async function insertLeaveDebit(
  client: TenantClient,
  d: { userId: string; leaveTypeId: string; units: number; requestId: string; effectiveDate: string; createdBy: string }
): Promise<void> {
  if (d.units <= 0) return;
  await client.query(
    `INSERT INTO lv2_leave_ledger
       (tenant_id, user_id, leave_type_id, entry_type, units, source, source_id, note, effective_date, created_by)
     VALUES ($1, $2, $3, 'debit', $4, 'leave_request', $5, 'Leave taken', $6, $7)`,
    [client.tenantId, d.userId, d.leaveTypeId, -Math.abs(d.units), d.requestId, d.effectiveDate, d.createdBy]
  );
}

// ── Manager-facing (approvals) ────────────────────────────────────────────────
/** All requests in the tenant with requester info; pending first. */
export async function listAll(client: TenantClient): Promise<LeaveRequestRow[]> {
  const { rows } = await client.query(
    `SELECT ${SELECT_REQ_EMP}
       FROM lv2_leave_requests r
       JOIN lv2_leave_types lt ON lt.id = r.leave_type_id
       JOIN users u ON u.id = r.user_id::text
      WHERE r.tenant_id = $1
      ORDER BY (r.status = 'pending') DESC, r.created_at DESC`,
    [client.tenantId]
  );
  return rows.map(mapReq);
}

/** Requests whose requester reports to `approverUserId`; pending first. */
export async function listForApprover(client: TenantClient, approverUserId: string): Promise<LeaveRequestRow[]> {
  const { rows } = await client.query(
    `SELECT ${SELECT_REQ_EMP}
       FROM lv2_leave_requests r
       JOIN lv2_leave_types lt ON lt.id = r.leave_type_id
       JOIN users u ON u.id = r.user_id::text
      WHERE r.tenant_id = $1 AND u.reports_to_id = $2
      ORDER BY (r.status = 'pending') DESC, r.created_at DESC`,
    [client.tenantId, approverUserId]
  );
  return rows.map(mapReq);
}

export async function findAnyById(client: TenantClient, id: string): Promise<LeaveRequestRow | null> {
  const { rows } = await client.query(
    `SELECT ${SELECT_REQ_EMP}
       FROM lv2_leave_requests r
       JOIN lv2_leave_types lt ON lt.id = r.leave_type_id
       JOIN users u ON u.id = r.user_id::text
      WHERE r.tenant_id = $1 AND r.id = $2`,
    [client.tenantId, id]
  );
  return rows[0] ? mapReq(rows[0]) : null;
}

export async function approveRequest(
  client: TenantClient,
  id: string,
  d: { paid: number; lop: number; approverId: string; note?: string | null }
): Promise<LeaveRequestRow | null> {
  const { rows } = await client.query(
    `WITH upd AS (
       UPDATE lv2_leave_requests
          SET status = 'approved', paid_units = $3, lop_units = $4,
              approver_id = $5, decided_at = now(), decision_note = $6,
              updated_by = $5, updated_at = now()
        WHERE tenant_id = $1 AND id = $2 AND status = 'pending'
        RETURNING *
     )
     SELECT ${SELECT_REQ_EMP}
       FROM upd r
       JOIN lv2_leave_types lt ON lt.id = r.leave_type_id
       JOIN users u ON u.id = r.user_id::text`,
    [client.tenantId, id, d.paid, d.lop, d.approverId, d.note ?? null]
  );
  return rows[0] ? mapReq(rows[0]) : null;
}

export async function rejectRequest(
  client: TenantClient,
  id: string,
  d: { approverId: string; note?: string | null }
): Promise<LeaveRequestRow | null> {
  const { rows } = await client.query(
    `WITH upd AS (
       UPDATE lv2_leave_requests
          SET status = 'rejected', approver_id = $3, decided_at = now(),
              decision_note = $4, updated_by = $3, updated_at = now()
        WHERE tenant_id = $1 AND id = $2 AND status = 'pending'
        RETURNING *
     )
     SELECT ${SELECT_REQ_EMP}
       FROM upd r
       JOIN lv2_leave_types lt ON lt.id = r.leave_type_id
       JOIN users u ON u.id = r.user_id::text`,
    [client.tenantId, id, d.approverId, d.note ?? null]
  );
  return rows[0] ? mapReq(rows[0]) : null;
}
