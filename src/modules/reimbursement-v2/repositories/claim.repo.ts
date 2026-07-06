// src/modules/reimbursement-v2/repositories/claim.repo.ts
//
// Raw-SQL data access for claims (header + items + attachments) and the pieces
// the workflow needs: per-tenant claim numbering, period aggregation for limit
// checks, and the reporting-manager lookup (against the Prisma-owned `users`
// table, scoped by the same tenant GUC / RLS).
//
// Every query takes a tenant-scoped client AND filters tenant_id explicitly.

import { TenantClient } from '../db/pool';
import {
  Claim,
  ClaimAttachment,
  ClaimItem,
  ClaimStatus,
  ApprovalInboxItem,
} from '../types';

const num = (v: string | null): number => (v == null ? 0 : Number(v));

// pg returns DATE columns as a local-midnight Date; format from LOCAL parts so a
// UTC conversion (toISOString) never shifts the calendar day across a tz offset.
function toYMD(v: any): string {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

// ── Header ──────────────────────────────────────────────────────────────────
const CLAIM_COLS = `
  id, tenant_id, user_id, claim_no, title, status, total_amount, currency,
  exchange_rate, base_currency, base_amount,
  submitted_at, approver_id, decided_at, decision_note, paid_at, paid_by,
  payment_reference, advance_id, project_id, department_id,
  created_by, updated_by, created_at, updated_at
`;

function mapClaim(r: any): Claim {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    userId: r.user_id,
    claimNo: r.claim_no,
    title: r.title,
    status: r.status,
    totalAmount: num(r.total_amount),
    currency: r.currency,
    exchangeRate: r.exchange_rate == null ? 1 : Number(r.exchange_rate),
    baseCurrency: r.base_currency,
    baseAmount: num(r.base_amount),
    submittedAt: r.submitted_at,
    approverId: r.approver_id,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
    paidAt: r.paid_at,
    paidBy: r.paid_by,
    paymentReference: r.payment_reference,
    advanceId: r.advance_id ?? null,
    projectId: r.project_id ?? null,
    departmentId: r.department_id ?? null,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapItem(r: any): ClaimItem {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    claimId: r.claim_id,
    categoryId: r.category_id,
    categoryName: r.category_name ?? null,
    categoryCode: r.category_code ?? null,
    expenseDate: toYMD(r.expense_date),
    merchant: r.merchant,
    billNo: r.bill_no,
    amount: num(r.amount),
    taxAmount: num(r.tax_amount),
    distance: r.distance == null ? null : Number(r.distance),
    description: r.description,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapAttachment(r: any): ClaimAttachment {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    claimId: r.claim_id,
    claimItemId: r.claim_item_id,
    fileName: r.file_name,
    fileUrl: r.file_url,
    fileSize: r.file_size == null ? null : Number(r.file_size),
    fileType: r.file_type,
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at,
  };
}

/** Atomically bump the per-tenant counter and format the next claim number. */
export async function nextClaimNo(client: TenantClient): Promise<string> {
  const { rows } = await client.query<{ last_no: string }>(
    `INSERT INTO rb2_claim_seq (tenant_id, last_no)
       VALUES ($1, 1)
     ON CONFLICT (tenant_id)
       DO UPDATE SET last_no = rb2_claim_seq.last_no + 1
     RETURNING last_no`,
    [client.tenantId]
  );
  return `REIMB-${String(rows[0].last_no).padStart(5, '0')}`;
}

export interface CreateClaimData {
  userId: string;
  claimNo: string;
  title?: string | null;
  currency: string;
  exchangeRate: number;
  baseCurrency: string;
  advanceId?: string | null;
  projectId?: string | null;
  departmentId?: string | null;
  createdBy: string;
}

export async function insertClaim(
  client: TenantClient,
  data: CreateClaimData
): Promise<Claim> {
  const { rows } = await client.query(
    `INSERT INTO rb2_claims
       (tenant_id, user_id, claim_no, title, currency, exchange_rate, base_currency,
        advance_id, project_id, department_id, status, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft', $11, $11)
     RETURNING ${CLAIM_COLS}`,
    [
      client.tenantId,
      data.userId,
      data.claimNo,
      data.title ?? null,
      data.currency,
      data.exchangeRate,
      data.baseCurrency,
      data.advanceId ?? null,
      data.projectId ?? null,
      data.departmentId ?? null,
      data.createdBy,
    ]
  );
  return mapClaim(rows[0]);
}

export async function findClaimById(
  client: TenantClient,
  id: string
): Promise<Claim | null> {
  const { rows } = await client.query(
    `SELECT ${CLAIM_COLS} FROM rb2_claims
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return rows[0] ? mapClaim(rows[0]) : null;
}

export async function updateClaimHeader(
  client: TenantClient,
  id: string,
  data: {
    title?: string | null;
    currency?: string;
    exchangeRate?: number;
    baseCurrency?: string;
    advanceId?: string | null;
    projectId?: string | null;
    departmentId?: string | null;
  },
  actorId: string
): Promise<Claim | null> {
  const sets: string[] = [];
  const params: any[] = [client.tenantId, id];
  if (data.title !== undefined) {
    params.push(data.title);
    sets.push(`title = $${params.length}`);
  }
  if (data.advanceId !== undefined) {
    params.push(data.advanceId);
    sets.push(`advance_id = $${params.length}`);
  }
  if (data.projectId !== undefined) {
    params.push(data.projectId);
    sets.push(`project_id = $${params.length}`);
  }
  if (data.departmentId !== undefined) {
    params.push(data.departmentId);
    sets.push(`department_id = $${params.length}`);
  }
  if (data.currency !== undefined) {
    params.push(data.currency);
    sets.push(`currency = $${params.length}`);
  }
  if (data.exchangeRate !== undefined) {
    params.push(data.exchangeRate);
    sets.push(`exchange_rate = $${params.length}`);
  }
  if (data.baseCurrency !== undefined) {
    params.push(data.baseCurrency);
    sets.push(`base_currency = $${params.length}`);
  }
  params.push(actorId);
  sets.push(`updated_by = $${params.length}`);
  sets.push('updated_at = now()');

  const { rows } = await client.query(
    `UPDATE rb2_claims SET ${sets.join(', ')}
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING ${CLAIM_COLS}`,
    params
  );
  return rows[0] ? mapClaim(rows[0]) : null;
}

/** Recompute total_amount from the sum of the claim's items. */
export async function recomputeTotal(
  client: TenantClient,
  claimId: string
): Promise<number> {
  const { rows } = await client.query<{ total: string }>(
    `UPDATE rb2_claims c
        SET total_amount = COALESCE(
              (SELECT sum(amount) FROM rb2_claim_items i
                WHERE i.tenant_id = c.tenant_id AND i.claim_id = c.id), 0),
            base_amount = COALESCE(
              (SELECT sum(amount) FROM rb2_claim_items i
                WHERE i.tenant_id = c.tenant_id AND i.claim_id = c.id), 0) * c.exchange_rate,
            updated_at = now()
      WHERE c.tenant_id = $1 AND c.id = $2 AND c.deleted_at IS NULL
      RETURNING total_amount AS total`,
    [client.tenantId, claimId]
  );
  return rows[0] ? num(rows[0].total) : 0;
}

export interface SetStatusData {
  status: ClaimStatus;
  approverId?: string | null;
  submittedAt?: boolean; // stamp now()
  decidedAt?: boolean; // stamp now()
  decisionNote?: string | null;
  paidAt?: boolean; // stamp now()
  paidBy?: string | null;
  paymentReference?: string | null;
}

/** Set the workflow status + related stamps in one update. */
export async function setStatus(
  client: TenantClient,
  id: string,
  data: SetStatusData,
  actorId: string
): Promise<Claim | null> {
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
  if (data.submittedAt) sets.push('submitted_at = now()');
  if (data.decidedAt) sets.push('decided_at = now()');
  if (data.paidAt) sets.push('paid_at = now()');

  const { rows } = await client.query(
    `UPDATE rb2_claims SET ${sets.join(', ')}
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING ${CLAIM_COLS}`,
    params
  );
  return rows[0] ? mapClaim(rows[0]) : null;
}

export interface ClaimListFilter {
  userId?: string;
  status?: ClaimStatus;
}

export async function listClaims(
  client: TenantClient,
  filter: ClaimListFilter
): Promise<Claim[]> {
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
  const { rows } = await client.query(
    `SELECT ${CLAIM_COLS} FROM rb2_claims
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC`,
    params
  );
  return rows.map(mapClaim);
}

export async function softDeleteClaim(
  client: TenantClient,
  id: string,
  actorId: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE rb2_claims
        SET deleted_at = now(), updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, actorId]
  );
  return (rowCount ?? 0) > 0;
}

// ── Items ───────────────────────────────────────────────────────────────────
const ITEM_COLS = `
  i.id, i.tenant_id, i.claim_id, i.category_id, i.expense_date, i.merchant,
  i.bill_no, i.amount, i.tax_amount, i.distance, i.description, i.created_at, i.updated_at,
  c.name AS category_name, c.code AS category_code
`;

export async function findItems(
  client: TenantClient,
  claimId: string
): Promise<ClaimItem[]> {
  const { rows } = await client.query(
    `SELECT ${ITEM_COLS}
       FROM rb2_claim_items i
       JOIN rb2_expense_categories c ON c.id = i.category_id
      WHERE i.tenant_id = $1 AND i.claim_id = $2
      ORDER BY i.expense_date ASC, i.created_at ASC`,
    [client.tenantId, claimId]
  );
  return rows.map(mapItem);
}

export async function findItemById(
  client: TenantClient,
  claimId: string,
  itemId: string
): Promise<ClaimItem | null> {
  const { rows } = await client.query(
    `SELECT ${ITEM_COLS}
       FROM rb2_claim_items i
       JOIN rb2_expense_categories c ON c.id = i.category_id
      WHERE i.tenant_id = $1 AND i.claim_id = $2 AND i.id = $3`,
    [client.tenantId, claimId, itemId]
  );
  return rows[0] ? mapItem(rows[0]) : null;
}

export interface ItemData {
  categoryId: string;
  expenseDate: string;
  merchant?: string | null;
  billNo?: string | null;
  amount: number;
  taxAmount?: number | null;
  distance?: number | null;
  description?: string | null;
}

export async function insertItem(
  client: TenantClient,
  claimId: string,
  data: ItemData
): Promise<ClaimItem> {
  const { rows } = await client.query(
    `INSERT INTO rb2_claim_items
       (tenant_id, claim_id, category_id, expense_date, merchant, bill_no, amount, tax_amount, distance, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      client.tenantId,
      claimId,
      data.categoryId,
      data.expenseDate,
      data.merchant ?? null,
      data.billNo ?? null,
      data.amount,
      data.taxAmount ?? 0,
      data.distance ?? null,
      data.description ?? null,
    ]
  );
  return (await findItemById(client, claimId, rows[0].id)) as ClaimItem;
}

export async function updateItem(
  client: TenantClient,
  claimId: string,
  itemId: string,
  data: Partial<ItemData>
): Promise<ClaimItem | null> {
  const map: Record<string, string> = {
    categoryId: 'category_id',
    expenseDate: 'expense_date',
    merchant: 'merchant',
    billNo: 'bill_no',
    amount: 'amount',
    taxAmount: 'tax_amount',
    distance: 'distance',
    description: 'description',
  };
  const sets: string[] = [];
  const params: any[] = [client.tenantId, claimId, itemId];
  for (const [key, column] of Object.entries(map)) {
    if (key in data && (data as any)[key] !== undefined) {
      params.push((data as any)[key]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  if (sets.length === 0) return findItemById(client, claimId, itemId);
  sets.push('updated_at = now()');
  const { rowCount } = await client.query(
    `UPDATE rb2_claim_items SET ${sets.join(', ')}
      WHERE tenant_id = $1 AND claim_id = $2 AND id = $3`,
    params
  );
  if (!rowCount) return null;
  return findItemById(client, claimId, itemId);
}

export async function deleteItem(
  client: TenantClient,
  claimId: string,
  itemId: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `DELETE FROM rb2_claim_items
      WHERE tenant_id = $1 AND claim_id = $2 AND id = $3`,
    [client.tenantId, claimId, itemId]
  );
  return (rowCount ?? 0) > 0;
}

// ── Attachments ─────────────────────────────────────────────────────────────
export async function findAttachments(
  client: TenantClient,
  claimId: string
): Promise<ClaimAttachment[]> {
  const { rows } = await client.query(
    `SELECT id, tenant_id, claim_id, claim_item_id, file_name, file_url,
            file_size, file_type, uploaded_by, uploaded_at
       FROM rb2_claim_attachments
      WHERE tenant_id = $1 AND claim_id = $2
      ORDER BY uploaded_at ASC`,
    [client.tenantId, claimId]
  );
  return rows.map(mapAttachment);
}

export interface AttachmentData {
  claimItemId?: string | null;
  fileName: string;
  fileUrl: string;
  fileSize?: number | null;
  fileType?: string | null;
  uploadedBy: string;
}

export async function insertAttachment(
  client: TenantClient,
  claimId: string,
  data: AttachmentData
): Promise<ClaimAttachment> {
  const { rows } = await client.query(
    `INSERT INTO rb2_claim_attachments
       (tenant_id, claim_id, claim_item_id, file_name, file_url, file_size, file_type, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, tenant_id, claim_id, claim_item_id, file_name, file_url,
               file_size, file_type, uploaded_by, uploaded_at`,
    [
      client.tenantId,
      claimId,
      data.claimItemId ?? null,
      data.fileName,
      data.fileUrl,
      data.fileSize ?? null,
      data.fileType ?? null,
      data.uploadedBy,
    ]
  );
  return mapAttachment(rows[0]);
}

export async function deleteAttachment(
  client: TenantClient,
  claimId: string,
  attachmentId: string
): Promise<ClaimAttachment | null> {
  const { rows } = await client.query(
    `DELETE FROM rb2_claim_attachments
      WHERE tenant_id = $1 AND claim_id = $2 AND id = $3
      RETURNING id, tenant_id, claim_id, claim_item_id, file_name, file_url,
                file_size, file_type, uploaded_by, uploaded_at`,
    [client.tenantId, claimId, attachmentId]
  );
  return rows[0] ? mapAttachment(rows[0]) : null;
}

// ── Limit aggregation ───────────────────────────────────────────────────────
/**
 * Sum of item amounts for one user + category within [from, to] (inclusive),
 * counting committed claims (pending/approved/paid) PLUS the claim currently
 * being submitted. Rejected/cancelled and other drafts are excluded.
 */
export async function periodSum(
  client: TenantClient,
  userId: string,
  categoryId: string,
  from: string,
  to: string,
  includeClaimId: string
): Promise<number> {
  const { rows } = await client.query<{ total: string }>(
    `SELECT COALESCE(sum(i.amount), 0) AS total
       FROM rb2_claim_items i
       JOIN rb2_claims c ON c.id = i.claim_id
      WHERE i.tenant_id = $1
        AND c.user_id = $2
        AND i.category_id = $3
        AND c.deleted_at IS NULL
        AND i.expense_date BETWEEN $4 AND $5
        AND (c.status IN ('pending', 'approved', 'paid') OR c.id = $6)`,
    [client.tenantId, userId, categoryId, from, to, includeClaimId]
  );
  return num(rows[0].total);
}

// ── Reporting manager (Prisma-owned users table, tenant-scoped by RLS/GUC) ──
export async function findReportsTo(
  client: TenantClient,
  userId: string
): Promise<string | null> {
  const { rows } = await client.query<{ reports_to_id: string | null }>(
    `SELECT reports_to_id FROM users WHERE id = $1::text LIMIT 1`,
    [userId]
  );
  return rows[0] ? rows[0].reports_to_id : null;
}

/** Applicable auto-approve threshold for a user from org/user-scoped policies. */
export async function autoApproveThreshold(
  client: TenantClient,
  userId: string
): Promise<number | null> {
  const { rows } = await client.query<{ threshold: string | null }>(
    `SELECT max(p.auto_approve_below) AS threshold
       FROM rb2_policies p
       JOIN rb2_policy_assignments a ON a.policy_id = p.id AND a.tenant_id = p.tenant_id
      WHERE p.tenant_id = $1
        AND p.deleted_at IS NULL
        AND p.is_active = true
        AND p.auto_approve_below IS NOT NULL
        AND (a.scope_type = 'org' OR (a.scope_type = 'user' AND a.scope_id = $2::uuid))`,
    [client.tenantId, userId]
  );
  return rows[0] && rows[0].threshold != null ? Number(rows[0].threshold) : null;
}

// ── Manager inbox (claims whose owner reports to the approver) ──────────────
export async function findPendingForApprover(
  client: TenantClient,
  approverUserId: string
): Promise<ApprovalInboxItem[]> {
  const { rows } = await client.query(
    `SELECT ${CLAIM_COLS.split(',').map((c) => 'c.' + c.trim()).join(', ')},
            u.name       AS requester_name,
            u.work_email AS requester_email,
            (SELECT count(*) FROM rb2_claim_items i WHERE i.claim_id = c.id) AS item_count
       FROM rb2_claims c
       JOIN users u ON u.id = c.user_id::text
      WHERE c.tenant_id = $1
        AND c.deleted_at IS NULL
        AND c.status = 'pending'
        AND u.reports_to_id = $2
      ORDER BY c.submitted_at ASC NULLS LAST, c.created_at ASC`,
    [client.tenantId, approverUserId]
  );
  return rows.map((r) => ({
    ...mapClaim(r),
    requesterName: r.requester_name ?? null,
    requesterEmail: r.requester_email ?? null,
    itemCount: Number(r.item_count),
  }));
}

/** ALL pending claims (for HR/admin/manage-all users, not scoped to reports). */
export async function findAllPending(client: TenantClient): Promise<ApprovalInboxItem[]> {
  const { rows } = await client.query(
    `SELECT ${CLAIM_COLS.split(',').map((c) => 'c.' + c.trim()).join(', ')},
            u.name       AS requester_name,
            u.work_email AS requester_email,
            (SELECT count(*) FROM rb2_claim_items i WHERE i.claim_id = c.id) AS item_count
       FROM rb2_claims c
       JOIN users u ON u.id = c.user_id::text
      WHERE c.tenant_id = $1
        AND c.deleted_at IS NULL
        AND c.status = 'pending'
      ORDER BY c.submitted_at ASC NULLS LAST, c.created_at ASC`,
    [client.tenantId]
  );
  return rows.map((r) => ({
    ...mapClaim(r),
    requesterName: r.requester_name ?? null,
    requesterEmail: r.requester_email ?? null,
    itemCount: Number(r.item_count),
  }));
}

/** Claims approved (by anyone) and not yet paid — the finance payable queue. */
export async function findPayable(client: TenantClient): Promise<ApprovalInboxItem[]> {
  const { rows } = await client.query(
    `SELECT ${CLAIM_COLS.split(',').map((c) => 'c.' + c.trim()).join(', ')},
            u.name       AS requester_name,
            u.work_email AS requester_email,
            (SELECT count(*) FROM rb2_claim_items i WHERE i.claim_id = c.id) AS item_count
       FROM rb2_claims c
       JOIN users u ON u.id = c.user_id::text
      WHERE c.tenant_id = $1
        AND c.deleted_at IS NULL
        AND c.status = 'approved'
      ORDER BY c.decided_at ASC NULLS LAST, c.created_at ASC`,
    [client.tenantId]
  );
  return rows.map((r) => ({
    ...mapClaim(r),
    requesterName: r.requester_name ?? null,
    requesterEmail: r.requester_email ?? null,
    itemCount: Number(r.item_count),
  }));
}

// ── Approval audit trail ────────────────────────────────────────────────────
export async function insertApproval(
  client: TenantClient,
  claimId: string,
  actorId: string,
  action: string,
  remarks?: string | null
): Promise<void> {
  await client.query(
    `INSERT INTO rb2_claim_approvals (tenant_id, claim_id, actor_id, action, remarks)
     VALUES ($1, $2, $3, $4, $5)`,
    [client.tenantId, claimId, actorId, action, remarks ?? null]
  );
}

export async function findApprovals(
  client: TenantClient,
  claimId: string
): Promise<any[]> {
  const { rows } = await client.query(
    `SELECT id, claim_id, actor_id, action, remarks, created_at
       FROM rb2_claim_approvals
      WHERE tenant_id = $1 AND claim_id = $2
      ORDER BY created_at ASC`,
    [client.tenantId, claimId]
  );
  return rows.map((r) => ({
    id: r.id,
    claimId: r.claim_id,
    actorId: r.actor_id,
    action: r.action,
    remarks: r.remarks,
    createdAt: r.created_at,
  }));
}
