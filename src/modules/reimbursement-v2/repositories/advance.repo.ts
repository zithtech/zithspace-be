// src/modules/reimbursement-v2/repositories/advance.repo.ts
//
// Raw-SQL data access for cash advances. Same tenant-scoped, explicit-filter
// conventions as claim.repo. Reconciliation is derived from linked PAID claims.

import { TenantClient } from '../db/pool';
import { Advance, AdvanceInboxItem, AdvanceStatus } from '../types';

const num = (v: string | null): number => (v == null ? 0 : Number(v));

// pg returns DATE columns as a local-midnight Date; format from LOCAL parts so a
// UTC conversion never shifts the calendar day across a tz offset.
function toYMD(v: any): string {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

const COLS = `
  id, tenant_id, user_id, advance_no, purpose, amount, currency, needed_by,
  status, approver_id, decided_at, decision_note, paid_at, paid_by,
  payment_reference, reconciled_amount, created_by, updated_by, created_at, updated_at
`;

function mapRow(r: any): Advance {
  const amount = num(r.amount);
  const reconciled = num(r.reconciled_amount);
  return {
    id: r.id,
    tenantId: r.tenant_id,
    userId: r.user_id,
    advanceNo: r.advance_no,
    purpose: r.purpose,
    amount,
    currency: r.currency,
    neededBy: r.needed_by == null ? null : toYMD(r.needed_by),
    status: r.status,
    approverId: r.approver_id,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
    paidAt: r.paid_at,
    paidBy: r.paid_by,
    paymentReference: r.payment_reference,
    reconciledAmount: reconciled,
    outstanding: Math.max(0, Math.round((amount - reconciled) * 100) / 100),
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function nextAdvanceNo(client: TenantClient): Promise<string> {
  const { rows } = await client.query<{ last_no: string }>(
    `INSERT INTO rb2_advance_seq (tenant_id, last_no)
       VALUES ($1, 1)
     ON CONFLICT (tenant_id)
       DO UPDATE SET last_no = rb2_advance_seq.last_no + 1
     RETURNING last_no`,
    [client.tenantId]
  );
  return `ADV-${String(rows[0].last_no).padStart(5, '0')}`;
}

export interface CreateAdvanceData {
  userId: string;
  advanceNo: string;
  purpose?: string | null;
  amount: number;
  currency: string;
  neededBy?: string | null;
  createdBy: string;
}

export async function insert(client: TenantClient, data: CreateAdvanceData): Promise<Advance> {
  const { rows } = await client.query(
    `INSERT INTO rb2_advances
       (tenant_id, user_id, advance_no, purpose, amount, currency, needed_by, status, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $8)
     RETURNING ${COLS}`,
    [
      client.tenantId,
      data.userId,
      data.advanceNo,
      data.purpose ?? null,
      data.amount,
      data.currency,
      data.neededBy ?? null,
      data.createdBy,
    ]
  );
  return mapRow(rows[0]);
}

export async function findById(client: TenantClient, id: string): Promise<Advance | null> {
  const { rows } = await client.query(
    `SELECT ${COLS} FROM rb2_advances
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function list(
  client: TenantClient,
  filter: { userId?: string; status?: AdvanceStatus; search?: string; page?: number; limit?: number } = {}
): Promise<{ advances: Advance[]; total: number }> {
  const conditions = ['tenant_id = $1', 'deleted_at IS NULL'];
  const params: any[] = [client.tenantId];
  if (filter.userId) {
    params.push(filter.userId);
    conditions.push(`user_id = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filter.search) {
    params.push(`%${filter.search}%`);
    conditions.push(`(advance_no ILIKE $${params.length} OR purpose ILIKE $${params.length})`);
  }

  const where = conditions.join(' AND ');

  const countResult = await client.query(
    `SELECT COUNT(*) AS total FROM rb2_advances WHERE ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const offset = (page - 1) * limit;

  const listParams = [...params, limit, offset];
  const { rows } = await client.query(
    `SELECT ${COLS} FROM rb2_advances
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  return { advances: rows.map(mapRow), total };
}

export interface AdvanceStatusData {
  status: AdvanceStatus;
  approverId?: string | null;
  decidedAt?: boolean;
  decisionNote?: string | null;
  paidAt?: boolean;
  paidBy?: string | null;
  paymentReference?: string | null;
}

export async function setStatus(
  client: TenantClient,
  id: string,
  data: AdvanceStatusData,
  actorId: string
): Promise<Advance | null> {
  const sets: string[] = ['status = $3', 'updated_by = $4', 'updated_at = now()'];
  const params: any[] = [client.tenantId, id, data.status, actorId];
  if (data.approverId !== undefined) {
    params.push(data.approverId);
    sets.push(`approver_id = $${params.length}`);
  }
  if (data.decisionNote !== undefined) {
    params.push(data.decisionNote);
    sets.push(`decision_note = $${params.length}`);
  }
  if (data.paidBy !== undefined) {
    params.push(data.paidBy);
    sets.push(`paid_by = $${params.length}`);
  }
  if (data.paymentReference !== undefined) {
    params.push(data.paymentReference);
    sets.push(`payment_reference = $${params.length}`);
  }
  if (data.decidedAt) sets.push('decided_at = now()');
  if (data.paidAt) sets.push('paid_at = now()');

  const { rows } = await client.query(
    `UPDATE rb2_advances SET ${sets.join(', ')}
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING ${COLS}`,
    params
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function softDelete(client: TenantClient, id: string, actorId: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE rb2_advances SET deleted_at = now(), updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, actorId]
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Recompute reconciled_amount from linked PAID claims and advance the status
 * (paid → partially_reconciled → reconciled). No-op unless the advance is in a
 * paid/reconciling state. Returns the refreshed advance.
 */
export async function recomputeReconciliation(
  client: TenantClient,
  id: string,
  actorId: string
): Promise<Advance | null> {
  const current = await findById(client, id);
  if (!current) return null;
  if (!['paid', 'partially_reconciled', 'reconciled'].includes(current.status)) return current;

  const { rows } = await client.query<{ total: string }>(
    `SELECT COALESCE(sum(total_amount), 0) AS total
       FROM rb2_claims
      WHERE tenant_id = $1 AND advance_id = $2 AND deleted_at IS NULL AND status = 'paid'`,
    [client.tenantId, id]
  );
  const reconciled = num(rows[0].total);
  const status: AdvanceStatus =
    reconciled >= current.amount ? 'reconciled' : reconciled > 0 ? 'partially_reconciled' : 'paid';

  const { rows: upd } = await client.query(
    `UPDATE rb2_advances
        SET reconciled_amount = $3, status = $4, updated_by = $5, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING ${COLS}`,
    [client.tenantId, id, reconciled, status, actorId]
  );
  return upd[0] ? mapRow(upd[0]) : null;
}

// ── Manager / finance queues ────────────────────────────────────────────────
async function inbox(
  client: TenantClient,
  where: string,
  params: any[],
  filter: { page?: number; limit?: number } = {}
): Promise<{ data: AdvanceInboxItem[]; total: number }> {
  const countResult = await client.query(
    `SELECT COUNT(*) AS total
       FROM rb2_advances a
       JOIN users u ON u.id = a.user_id::text
      WHERE ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const offset = (page - 1) * limit;

  const listParams = [...params, limit, offset];

  const { rows } = await client.query(
    `SELECT ${COLS.split(',').map((c) => 'a.' + c.trim()).join(', ')},
            u.name AS requester_name, u.work_email AS requester_email
       FROM rb2_advances a
       JOIN users u ON u.id = a.user_id::text
      WHERE ${where}
      ORDER BY a.created_at ASC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  return {
    data: rows.map((r) => ({
      ...mapRow(r),
      requesterName: r.requester_name ?? null,
      requesterEmail: r.requester_email ?? null,
    })),
    total,
  };
}

export function findPendingForApprover(
  client: TenantClient,
  approverUserId: string,
  filter: { page?: number; limit?: number } = {}
): Promise<{ data: AdvanceInboxItem[]; total: number }> {
  return inbox(
    client,
    `a.tenant_id = $1 AND a.deleted_at IS NULL AND a.status = 'pending' AND u.reports_to_id = $2`,
    [client.tenantId, approverUserId],
    filter
  );
}

/** ALL pending advances (for HR/admin/manage-all users, not scoped to reports). */
export function findAllPending(client: TenantClient, filter: { page?: number; limit?: number } = {}): Promise<{ data: AdvanceInboxItem[]; total: number }> {
  return inbox(
    client,
    `a.tenant_id = $1 AND a.deleted_at IS NULL AND a.status = 'pending'`,
    [client.tenantId],
    filter
  );
}

export async function findPayable(client: TenantClient, filter: { page?: number; limit?: number } = {}): Promise<{ data: AdvanceInboxItem[]; total: number }> {
  return inbox(
    client,
    `a.tenant_id = $1 AND a.deleted_at IS NULL AND a.status = 'approved'`,
    [client.tenantId],
    filter
  );
}
