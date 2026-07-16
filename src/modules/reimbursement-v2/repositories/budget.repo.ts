// src/modules/reimbursement-v2/repositories/budget.repo.ts
//
// Raw-SQL data access for budgets + derived spend. Spend is computed by
// aggregating non-cancelled claims that match the budget scope within its
// period (attributed by claim.created_at; category budgets aggregate items).
// Scopes resolve from claim cost tags (project_id / department_id / user_id) and
// category — no org-hierarchy join needed.

import { TenantClient } from '../db/pool';
import { Budget, BudgetScopeType } from '../types';

const num = (v: string | null): number => (v == null ? 0 : Number(v));
// pg returns DATE columns as a local-midnight Date; format from LOCAL parts so a
// UTC conversion (toISOString) can't shift the calendar day. See toYMD usage.
const asDate = (v: any): string => {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
};

const COLS = `
  id, tenant_id, name, scope_type, scope_id, period_start, period_end,
  amount, currency, is_active, created_by, updated_by, created_at, updated_at
`;

function mapRow(r: any): Budget {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    scopeType: r.scope_type,
    scopeId: r.scope_id,
    periodStart: asDate(r.period_start),
    periodEnd: asDate(r.period_end),
    amount: num(r.amount),
    currency: r.currency,
    isActive: r.is_active,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface BudgetData {
  name: string;
  scopeType: BudgetScopeType;
  scopeId?: string | null;
  periodStart: string;
  periodEnd: string;
  amount: number;
  currency: string;
  isActive: boolean;
}

export async function insert(client: TenantClient, data: BudgetData, actorId: string): Promise<Budget> {
  const { rows } = await client.query(
    `INSERT INTO rb2_budgets
       (tenant_id, name, scope_type, scope_id, period_start, period_end, amount, currency, is_active, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
     RETURNING ${COLS}`,
    [
      client.tenantId,
      data.name,
      data.scopeType,
      data.scopeType === 'org' ? null : data.scopeId ?? null,
      data.periodStart,
      data.periodEnd,
      data.amount,
      data.currency,
      data.isActive,
      actorId,
    ]
  );
  return mapRow(rows[0]);
}

export async function update(
  client: TenantClient,
  id: string,
  data: BudgetData,
  actorId: string
): Promise<Budget | null> {
  const { rows } = await client.query(
    `UPDATE rb2_budgets
        SET name = $3, scope_type = $4, scope_id = $5, period_start = $6, period_end = $7,
            amount = $8, currency = $9, is_active = $10, updated_by = $11, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING ${COLS}`,
    [
      client.tenantId,
      id,
      data.name,
      data.scopeType,
      data.scopeType === 'org' ? null : data.scopeId ?? null,
      data.periodStart,
      data.periodEnd,
      data.amount,
      data.currency,
      data.isActive,
      actorId,
    ]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findById(client: TenantClient, id: string): Promise<Budget | null> {
  const { rows } = await client.query(
    `SELECT ${COLS} FROM rb2_budgets WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findDuplicate(
  client: TenantClient,
  scopeType: BudgetScopeType,
  scopeId: string | null,
  periodStart: string,
  periodEnd: string
): Promise<Budget | null> {
  const scopeIdVal = scopeType === 'org' ? null : scopeId ?? null;
  const { rows } = await client.query(
    `SELECT ${COLS} FROM rb2_budgets 
      WHERE tenant_id = $1 
        AND scope_type = $2 
        AND scope_id IS NOT DISTINCT FROM $3
        AND period_start = $4 
        AND period_end = $5 
        AND deleted_at IS NULL LIMIT 1`,
    [client.tenantId, scopeType, scopeIdVal, periodStart, periodEnd]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function list(
  client: TenantClient,
  opts: { includeInactive?: boolean } = {}
): Promise<Budget[]> {
  const conditions = ['tenant_id = $1', 'deleted_at IS NULL'];
  if (!opts.includeInactive) conditions.push('is_active = true');
  const { rows } = await client.query(
    `SELECT ${COLS} FROM rb2_budgets WHERE ${conditions.join(' AND ')} ORDER BY period_start DESC, name ASC`,
    [client.tenantId]
  );
  return rows.map(mapRow);
}

export async function softDelete(client: TenantClient, id: string, actorId: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE rb2_budgets SET deleted_at = now(), updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, actorId]
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Derived spend (base currency) for a budget's scope within its period.
 * Claim-level scopes sum base_amount; category sums item amount × exchange_rate.
 * Cancelled and soft-deleted claims are excluded.
 */
export async function spendFor(client: TenantClient, budget: Budget): Promise<number> {
  const p: any[] = [client.tenantId, budget.periodStart, budget.periodEnd];

  if (budget.scopeType === 'category') {
    p.push(budget.scopeId);
    const { rows } = await client.query<{ total: string }>(
      `SELECT COALESCE(sum(i.amount * cl.exchange_rate), 0) AS total
         FROM rb2_claim_items i
         JOIN rb2_claims cl ON cl.id = i.claim_id
        WHERE i.tenant_id = $1
          AND cl.deleted_at IS NULL AND cl.status <> 'cancelled'
          AND cl.created_at >= $2 AND cl.created_at < ($3::date + 1)
          AND i.category_id = $4`,
      p
    );
    return num(rows[0].total);
  }

  let scopeClause = '';
  if (budget.scopeType === 'department') {
    p.push(budget.scopeId);
    scopeClause = ` AND department_id = $${p.length}`;
  } else if (budget.scopeType === 'project') {
    p.push(budget.scopeId);
    scopeClause = ` AND project_id = $${p.length}`;
  } else if (budget.scopeType === 'user') {
    p.push(budget.scopeId);
    scopeClause = ` AND user_id = $${p.length}`;
  } // 'org' → no extra clause

  const { rows } = await client.query<{ total: string }>(
    `SELECT COALESCE(sum(base_amount), 0) AS total
       FROM rb2_claims
      WHERE tenant_id = $1
        AND deleted_at IS NULL AND status <> 'cancelled'
        AND created_at >= $2 AND created_at < ($3::date + 1)${scopeClause}`,
    p
  );
  return num(rows[0].total);
}
