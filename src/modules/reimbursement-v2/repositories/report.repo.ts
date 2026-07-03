// src/modules/reimbursement-v2/repositories/report.repo.ts
//
// Read-only aggregation queries for the reimbursement dashboard. All figures are
// in the org base currency: claim headers carry base_amount; category rollups
// convert item amounts with the claim's exchange_rate. Cancelled claims are
// excluded from spend rollups.

import { TenantClient } from '../db/pool';

const num = (v: string | null): number => (v == null ? 0 : Number(v));

export interface DateRange {
  from?: string; // YYYY-MM-DD inclusive
  to?: string; // YYYY-MM-DD inclusive
}

/** Build a created_at range predicate + params, starting after the given base. */
function rangeClause(range: DateRange, params: any[], col: string): string {
  let sql = '';
  if (range.from) {
    params.push(range.from);
    sql += ` AND ${col} >= $${params.length}`;
  }
  if (range.to) {
    params.push(range.to);
    sql += ` AND ${col} < ($${params.length}::date + 1)`;
  }
  return sql;
}

export interface StatusBucket {
  status: string;
  count: number;
  total: number;
}

export async function summaryByStatus(client: TenantClient, range: DateRange): Promise<StatusBucket[]> {
  const params: any[] = [client.tenantId];
  const clause = rangeClause(range, params, 'created_at');
  const { rows } = await client.query(
    `SELECT status, count(*) AS cnt, COALESCE(sum(base_amount), 0) AS total
       FROM rb2_claims
      WHERE tenant_id = $1 AND deleted_at IS NULL${clause}
      GROUP BY status
      ORDER BY status`,
    params
  );
  return rows.map((r) => ({ status: r.status, count: Number(r.cnt), total: num(r.total) }));
}

export interface CategorySpend {
  categoryId: string;
  name: string;
  code: string;
  claims: number;
  total: number;
}

export async function spendByCategory(client: TenantClient, range: DateRange): Promise<CategorySpend[]> {
  const params: any[] = [client.tenantId];
  const clause = rangeClause(range, params, 'cl.created_at');
  const { rows } = await client.query(
    `SELECT c.id, c.name, c.code,
            count(DISTINCT i.claim_id) AS claims,
            COALESCE(sum(i.amount * cl.exchange_rate), 0) AS total
       FROM rb2_claim_items i
       JOIN rb2_claims cl ON cl.id = i.claim_id
       JOIN rb2_expense_categories c ON c.id = i.category_id
      WHERE i.tenant_id = $1 AND cl.deleted_at IS NULL AND cl.status <> 'cancelled'${clause}
      GROUP BY c.id, c.name, c.code
      ORDER BY total DESC`,
    params
  );
  return rows.map((r) => ({
    categoryId: r.id,
    name: r.name,
    code: r.code,
    claims: Number(r.claims),
    total: num(r.total),
  }));
}

export interface UserSpend {
  userId: string;
  name: string | null;
  email: string | null;
  claims: number;
  total: number;
}

export async function spendByUser(client: TenantClient, range: DateRange): Promise<UserSpend[]> {
  const params: any[] = [client.tenantId];
  const clause = rangeClause(range, params, 'cl.created_at');
  const { rows } = await client.query(
    `SELECT cl.user_id, u.name, u.work_email AS email,
            count(*) AS claims, COALESCE(sum(cl.base_amount), 0) AS total
       FROM rb2_claims cl
       JOIN users u ON u.id = cl.user_id::text
      WHERE cl.tenant_id = $1 AND cl.deleted_at IS NULL AND cl.status <> 'cancelled'${clause}
      GROUP BY cl.user_id, u.name, u.work_email
      ORDER BY total DESC`,
    params
  );
  return rows.map((r) => ({
    userId: r.user_id,
    name: r.name ?? null,
    email: r.email ?? null,
    claims: Number(r.claims),
    total: num(r.total),
  }));
}
