// src/modules/reimbursement-v2/repositories/category.repo.ts
//
// Raw-SQL data access for rb2_expense_categories. This layer ONLY builds
// parameterized queries and maps rows — no business rules, no HTTP concerns.
//
// Every query takes a TenantClient (already scoped via withTenant) AND filters
// `tenant_id = $1` explicitly. RLS would enforce this anyway; the explicit
// filter is the second, independent guard against cross-tenant access.

import { TenantClient } from '../db/pool';
import { ExpenseCategory } from '../types';

interface CategoryRow {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  description: string | null;
  gl_code: string | null;
  kind: 'amount' | 'mileage';
  mileage_rate: string | null;
  mileage_unit: string | null;
  max_per_claim: string | null;
  monthly_limit: string | null;
  yearly_limit: string | null;
  per_day_limit: string | null;
  receipt_required: boolean;
  receipt_required_above: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

const num = (v: string | null): number | null => (v == null ? null : Number(v));

function mapRow(row: CategoryRow): ExpenseCategory {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    code: row.code,
    description: row.description,
    glCode: row.gl_code,
    kind: row.kind,
    mileageRate: num(row.mileage_rate),
    mileageUnit: row.mileage_unit,
    maxPerClaim: num(row.max_per_claim),
    monthlyLimit: num(row.monthly_limit),
    yearlyLimit: num(row.yearly_limit),
    perDayLimit: num(row.per_day_limit),
    receiptRequired: row.receipt_required,
    receiptRequiredAbove: num(row.receipt_required_above),
    isActive: row.is_active,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLS = `
  id, tenant_id, name, code, description, gl_code,
  kind, mileage_rate, mileage_unit,
  max_per_claim, monthly_limit, yearly_limit, per_day_limit,
  receipt_required, receipt_required_above, is_active,
  created_by, updated_by, created_at, updated_at
`;

export interface CreateCategoryData {
  name: string;
  code: string;
  description?: string | null;
  glCode?: string | null;
  kind: 'amount' | 'mileage';
  mileageRate?: number | null;
  mileageUnit?: string | null;
  maxPerClaim?: number | null;
  monthlyLimit?: number | null;
  yearlyLimit?: number | null;
  perDayLimit?: number | null;
  receiptRequired: boolean;
  receiptRequiredAbove?: number | null;
  isActive: boolean;
  createdBy: string;
}

export async function insert(
  client: TenantClient,
  data: CreateCategoryData
): Promise<ExpenseCategory> {
  const { rows } = await client.query<CategoryRow>(
    `INSERT INTO rb2_expense_categories
       (tenant_id, name, code, description, gl_code,
        kind, mileage_rate, mileage_unit,
        max_per_claim, monthly_limit, yearly_limit, per_day_limit,
        receipt_required, receipt_required_above, is_active, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)
     RETURNING ${SELECT_COLS}`,
    [
      client.tenantId,
      data.name,
      data.code,
      data.description ?? null,
      data.glCode ?? null,
      data.kind,
      data.mileageRate ?? null,
      data.mileageUnit ?? null,
      data.maxPerClaim ?? null,
      data.monthlyLimit ?? null,
      data.yearlyLimit ?? null,
      data.perDayLimit ?? null,
      data.receiptRequired,
      data.receiptRequiredAbove ?? null,
      data.isActive,
      data.createdBy,
    ]
  );
  return mapRow(rows[0]);
}

export async function findAll(
  client: TenantClient,
  opts: { includeInactive?: boolean; page?: number; limit?: number; search?: string } = {}
): Promise<{ data: ExpenseCategory[]; total: number }> {
  const conditions = ['tenant_id = $1', 'deleted_at IS NULL'];
  const params: any[] = [client.tenantId];

  if (!opts.includeInactive) {
    conditions.push('is_active = true');
  }

  if (opts.search) {
    params.push(`%${opts.search}%`);
    conditions.push(`(name ILIKE $${params.length} OR code ILIKE $${params.length})`);
  }

  const countResult = await client.query(
    `SELECT COUNT(*) AS total FROM rb2_expense_categories WHERE ${conditions.join(' AND ')}`,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const page = opts.page ?? 1;
  const limit = opts.limit ?? 20;
  const offset = (page - 1) * limit;

  params.push(limit, offset);

  const { rows } = await client.query<CategoryRow>(
    `SELECT ${SELECT_COLS}
       FROM rb2_expense_categories
      WHERE ${conditions.join(' AND ')}
      ORDER BY name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return {
    data: rows.map(mapRow),
    total,
  };
}

export async function findById(
  client: TenantClient,
  id: string
): Promise<ExpenseCategory | null> {
  const { rows } = await client.query<CategoryRow>(
    `SELECT ${SELECT_COLS}
       FROM rb2_expense_categories
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * True if a non-deleted category with this code exists for the tenant.
 * `excludeId` skips a specific row (used during update).
 */
export async function existsByCode(
  client: TenantClient,
  code: string,
  excludeId?: string
): Promise<boolean> {
  const params: any[] = [client.tenantId, code];
  let sql = `SELECT 1 FROM rb2_expense_categories
              WHERE tenant_id = $1 AND lower(code) = lower($2) AND deleted_at IS NULL`;
  if (excludeId) {
    params.push(excludeId);
    sql += ` AND id <> $3`;
  }
  sql += ' LIMIT 1';
  const { rowCount } = await client.query(sql, params);
  return (rowCount ?? 0) > 0;
}

export interface UpdateCategoryData {
  name?: string;
  code?: string;
  description?: string | null;
  glCode?: string | null;
  kind?: 'amount' | 'mileage';
  mileageRate?: number | null;
  mileageUnit?: string | null;
  maxPerClaim?: number | null;
  monthlyLimit?: number | null;
  yearlyLimit?: number | null;
  perDayLimit?: number | null;
  receiptRequired?: boolean;
  receiptRequiredAbove?: number | null;
  isActive?: boolean;
  updatedBy: string;
}

const COLUMN_MAP: Record<string, string> = {
  name: 'name',
  code: 'code',
  description: 'description',
  glCode: 'gl_code',
  kind: 'kind',
  mileageRate: 'mileage_rate',
  mileageUnit: 'mileage_unit',
  maxPerClaim: 'max_per_claim',
  monthlyLimit: 'monthly_limit',
  yearlyLimit: 'yearly_limit',
  perDayLimit: 'per_day_limit',
  receiptRequired: 'receipt_required',
  receiptRequiredAbove: 'receipt_required_above',
  isActive: 'is_active',
};

/** Dynamic partial update. Returns the updated row, or null if not found. */
export async function update(
  client: TenantClient,
  id: string,
  data: UpdateCategoryData
): Promise<ExpenseCategory | null> {
  const sets: string[] = [];
  const params: any[] = [client.tenantId, id];

  for (const [key, column] of Object.entries(COLUMN_MAP)) {
    if (key in data && (data as any)[key] !== undefined) {
      params.push((data as any)[key]);
      sets.push(`${column} = $${params.length}`);
    }
  }

  params.push(data.updatedBy);
  sets.push(`updated_by = $${params.length}`);
  sets.push('updated_at = now()');

  const { rows } = await client.query<CategoryRow>(
    `UPDATE rb2_expense_categories
        SET ${sets.join(', ')}
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING ${SELECT_COLS}`,
    params
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Soft delete. Returns true if a row was affected. */
export async function softDelete(
  client: TenantClient,
  id: string,
  deletedBy: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE rb2_expense_categories
        SET deleted_at = now(), updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, deletedBy]
  );
  return (rowCount ?? 0) > 0;
}
