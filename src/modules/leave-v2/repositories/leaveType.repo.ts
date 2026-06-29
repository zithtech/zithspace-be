// src/modules/leave-v2/repositories/leaveType.repo.ts
//
// Raw-SQL data access for lv2_leave_types. This layer ONLY builds parameterized
// queries and maps rows — no business rules, no HTTP concerns.
//
// Every query takes a TenantClient (already scoped via withTenant) AND filters
// `tenant_id = $1` explicitly. RLS would enforce this anyway; the explicit
// filter is the second, independent guard against cross-tenant access.

import { TenantClient } from '../db/pool';
import { LeaveType } from '../types';

interface LeaveTypeRow {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  unit: 'day' | 'hour';
  is_paid: boolean;
  requires_approval: boolean;
  color: string | null;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: LeaveTypeRow): LeaveType {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    code: row.code,
    unit: row.unit,
    isPaid: row.is_paid,
    requiresApproval: row.requires_approval,
    color: row.color,
    description: row.description,
    isActive: row.is_active,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLS = `
  id, tenant_id, name, code, unit, is_paid, requires_approval,
  color, description, is_active, created_by, updated_by, created_at, updated_at
`;

export interface CreateLeaveTypeData {
  name: string;
  code: string;
  unit: 'day' | 'hour';
  isPaid: boolean;
  requiresApproval: boolean;
  color?: string | null;
  description?: string | null;
  isActive: boolean;
  createdBy: string;
}

export async function insert(
  client: TenantClient,
  data: CreateLeaveTypeData
): Promise<LeaveType> {
  const { rows } = await client.query<LeaveTypeRow>(
    `INSERT INTO lv2_leave_types
       (tenant_id, name, code, unit, is_paid, requires_approval,
        color, description, is_active, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
     RETURNING ${SELECT_COLS}`,
    [
      client.tenantId,
      data.name,
      data.code,
      data.unit,
      data.isPaid,
      data.requiresApproval,
      data.color ?? null,
      data.description ?? null,
      data.isActive,
      data.createdBy,
    ]
  );
  return mapRow(rows[0]);
}

export async function findAll(
  client: TenantClient,
  opts: { includeInactive?: boolean } = {}
): Promise<LeaveType[]> {
  const conditions = ['tenant_id = $1', 'deleted_at IS NULL'];
  if (!opts.includeInactive) {
    conditions.push('is_active = true');
  }
  const { rows } = await client.query<LeaveTypeRow>(
    `SELECT ${SELECT_COLS}
       FROM lv2_leave_types
      WHERE ${conditions.join(' AND ')}
      ORDER BY name ASC`,
    [client.tenantId]
  );
  return rows.map(mapRow);
}

export async function findById(
  client: TenantClient,
  id: string
): Promise<LeaveType | null> {
  const { rows } = await client.query<LeaveTypeRow>(
    `SELECT ${SELECT_COLS}
       FROM lv2_leave_types
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * True if a non-deleted leave type with this code exists for the tenant.
 * `excludeId` skips a specific row (used during update).
 */
export async function existsByCode(
  client: TenantClient,
  code: string,
  excludeId?: string
): Promise<boolean> {
  const params: any[] = [client.tenantId, code];
  let sql = `SELECT 1 FROM lv2_leave_types
              WHERE tenant_id = $1 AND lower(code) = lower($2) AND deleted_at IS NULL`;
  if (excludeId) {
    params.push(excludeId);
    sql += ` AND id <> $3`;
  }
  sql += ' LIMIT 1';
  const { rowCount } = await client.query(sql, params);
  return rowCount > 0;
}

export interface UpdateLeaveTypeData {
  name?: string;
  code?: string;
  unit?: 'day' | 'hour';
  isPaid?: boolean;
  requiresApproval?: boolean;
  color?: string | null;
  description?: string | null;
  isActive?: boolean;
  updatedBy: string;
}

const COLUMN_MAP: Record<string, string> = {
  name: 'name',
  code: 'code',
  unit: 'unit',
  isPaid: 'is_paid',
  requiresApproval: 'requires_approval',
  color: 'color',
  description: 'description',
  isActive: 'is_active',
};

/** Dynamic partial update. Returns the updated row, or null if not found. */
export async function update(
  client: TenantClient,
  id: string,
  data: UpdateLeaveTypeData
): Promise<LeaveType | null> {
  const sets: string[] = [];
  const params: any[] = [client.tenantId, id];

  for (const [key, column] of Object.entries(COLUMN_MAP)) {
    if (key in data && (data as any)[key] !== undefined) {
      params.push((data as any)[key]);
      sets.push(`${column} = $${params.length}`);
    }
  }

  // Always stamp updated_by / updated_at.
  params.push(data.updatedBy);
  sets.push(`updated_by = $${params.length}`);
  sets.push('updated_at = now()');

  const { rows } = await client.query<LeaveTypeRow>(
    `UPDATE lv2_leave_types
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
    `UPDATE lv2_leave_types
        SET deleted_at = now(), updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, deletedBy]
  );
  return rowCount > 0;
}
