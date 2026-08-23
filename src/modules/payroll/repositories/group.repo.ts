// src/modules/payroll/repositories/group.repo.ts
//
// Raw-SQL data access for pay_groups. Every query takes a tenant-scoped client
// AND filters tenant_id explicitly.

import { TenantClient } from '../db/pool';
import { PayGroup, PayGroupListItem } from '../types';

interface GroupRow {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  schedule_id: string;
  legal_entity: string | null;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

const COLS = `
  id, tenant_id, name, code, schedule_id, legal_entity, description, is_active,
  created_by, updated_by, created_at, updated_at
`;

function mapRow(r: GroupRow): PayGroup {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    code: r.code,
    scheduleId: r.schedule_id,
    legalEntity: r.legal_entity,
    description: r.description,
    isActive: r.is_active,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface CreateGroupData {
  name: string;
  code: string;
  scheduleId: string;
  legalEntity: string | null;
  description: string | null;
  isActive: boolean;
  createdBy: string;
}

export async function insert(client: TenantClient, data: CreateGroupData): Promise<PayGroup> {
  const { rows } = await client.query<GroupRow>(
    `INSERT INTO pay_groups
       (tenant_id, name, code, schedule_id, legal_entity, description, is_active, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
     RETURNING ${COLS}`,
    [client.tenantId, data.name, data.code, data.scheduleId, data.legalEntity, data.description, data.isActive, data.createdBy]
  );
  return mapRow(rows[0]);
}

export async function findAll(
  client: TenantClient,
  opts: { includeInactive?: boolean; page?: number; limit?: number; search?: string } = {}
): Promise<{ data: PayGroupListItem[]; total: number }> {
  const conditions = ['g.tenant_id = $1', 'g.deleted_at IS NULL'];
  const params: any[] = [client.tenantId];

  if (!opts.includeInactive) {
    conditions.push('g.is_active = true');
  }

  if (opts.search) {
    params.push(`%${opts.search}%`);
    conditions.push(`(g.name ILIKE $${params.length} OR g.code ILIKE $${params.length} OR g.legal_entity ILIKE $${params.length})`);
  }

  const countResult = await client.query(
    `SELECT COUNT(*) AS total FROM pay_groups g WHERE ${conditions.join(' AND ')}`,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const page = opts.page ?? 1;
  const limit = opts.limit ?? 20;
  const offset = (page - 1) * limit;

  params.push(limit, offset);

  const { rows } = await client.query(
    `SELECT ${COLS.split(',').map((c) => 'g.' + c.trim()).join(', ')},
            s.name AS schedule_name, s.code AS schedule_code
       FROM pay_groups g
       LEFT JOIN pay_schedules s ON s.id = g.schedule_id AND s.tenant_id = g.tenant_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY g.name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return {
    data: rows.map((r) => ({
      ...mapRow(r),
      scheduleName: r.schedule_name ?? null,
      scheduleCode: r.schedule_code ?? null,
    })),
    total,
  };
}

export async function findById(client: TenantClient, id: string): Promise<PayGroup | null> {
  const { rows } = await client.query<GroupRow>(
    `SELECT ${COLS} FROM pay_groups WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function existsByCode(client: TenantClient, code: string, excludeId?: string): Promise<boolean> {
  const params: any[] = [client.tenantId, code];
  let sql = `SELECT 1 FROM pay_groups WHERE tenant_id = $1 AND lower(code) = lower($2) AND deleted_at IS NULL`;
  if (excludeId) { params.push(excludeId); sql += ` AND id <> $3`; }
  sql += ' LIMIT 1';
  const { rowCount } = await client.query(sql, params);
  return (rowCount ?? 0) > 0;
}

/** True if the schedule exists and is live for this tenant. */
export async function scheduleExists(client: TenantClient, scheduleId: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM pay_schedules WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL LIMIT 1`,
    [client.tenantId, scheduleId]
  );
  return (rowCount ?? 0) > 0;
}

export interface UpdateGroupData {
  name?: string;
  code?: string;
  scheduleId?: string;
  legalEntity?: string | null;
  description?: string | null;
  isActive?: boolean;
  updatedBy: string;
}

const COLUMN_MAP: Record<string, string> = {
  name: 'name',
  code: 'code',
  scheduleId: 'schedule_id',
  legalEntity: 'legal_entity',
  description: 'description',
  isActive: 'is_active',
};

export async function update(client: TenantClient, id: string, data: UpdateGroupData): Promise<PayGroup | null> {
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
  const { rows } = await client.query<GroupRow>(
    `UPDATE pay_groups SET ${sets.join(', ')}
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING ${COLS}`,
    params
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function softDelete(client: TenantClient, id: string, deletedBy: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE pay_groups SET deleted_at = now(), updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, deletedBy]
  );
  return (rowCount ?? 0) > 0;
}
