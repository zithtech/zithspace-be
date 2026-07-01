// src/modules/payroll/repositories/schedule.repo.ts
//
// Raw-SQL data access for pay_schedules. Every query takes a tenant-scoped
// client AND filters tenant_id explicitly.

import { TenantClient } from '../db/pool';
import { PaySchedule, PayScheduleListItem, PayFrequency } from '../types';

interface ScheduleRow {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  frequency: PayFrequency;
  cycle_start_day: number;
  cycle_end_day: number;
  pay_day: number;
  pay_in_next_month: boolean;
  is_default: boolean;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

const COLS = `
  id, tenant_id, name, code, frequency, cycle_start_day, cycle_end_day,
  pay_day, pay_in_next_month, is_default, description, is_active,
  created_by, updated_by, created_at, updated_at
`;

function mapRow(r: ScheduleRow): PaySchedule {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    code: r.code,
    frequency: r.frequency,
    cycleStartDay: r.cycle_start_day,
    cycleEndDay: r.cycle_end_day,
    payDay: r.pay_day,
    payInNextMonth: r.pay_in_next_month,
    isDefault: r.is_default,
    description: r.description,
    isActive: r.is_active,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface CreateScheduleData {
  name: string;
  code: string;
  frequency: PayFrequency;
  cycleStartDay: number;
  cycleEndDay: number;
  payDay: number;
  payInNextMonth: boolean;
  isDefault: boolean;
  description: string | null;
  isActive: boolean;
  createdBy: string;
}

export async function insert(client: TenantClient, data: CreateScheduleData): Promise<PaySchedule> {
  const { rows } = await client.query<ScheduleRow>(
    `INSERT INTO pay_schedules
       (tenant_id, name, code, frequency, cycle_start_day, cycle_end_day, pay_day,
        pay_in_next_month, is_default, description, is_active, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
     RETURNING ${COLS}`,
    [
      client.tenantId, data.name, data.code, data.frequency, data.cycleStartDay,
      data.cycleEndDay, data.payDay, data.payInNextMonth, data.isDefault,
      data.description, data.isActive, data.createdBy,
    ]
  );
  return mapRow(rows[0]);
}

export async function findAll(
  client: TenantClient,
  opts: { includeInactive?: boolean } = {}
): Promise<PayScheduleListItem[]> {
  const conditions = ['s.tenant_id = $1', 's.deleted_at IS NULL'];
  if (!opts.includeInactive) conditions.push('s.is_active = true');
  const { rows } = await client.query(
    `SELECT ${COLS.split(',').map((c) => 's.' + c.trim()).join(', ')},
            (SELECT count(*) FROM pay_groups g WHERE g.schedule_id = s.id AND g.deleted_at IS NULL) AS group_count
       FROM pay_schedules s
      WHERE ${conditions.join(' AND ')}
      ORDER BY s.is_default DESC, s.name ASC`,
    [client.tenantId]
  );
  return rows.map((r) => ({ ...mapRow(r), groupCount: Number(r.group_count) }));
}

export async function findById(client: TenantClient, id: string): Promise<PaySchedule | null> {
  const { rows } = await client.query<ScheduleRow>(
    `SELECT ${COLS} FROM pay_schedules WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function existsByCode(client: TenantClient, code: string, excludeId?: string): Promise<boolean> {
  const params: any[] = [client.tenantId, code];
  let sql = `SELECT 1 FROM pay_schedules WHERE tenant_id = $1 AND lower(code) = lower($2) AND deleted_at IS NULL`;
  if (excludeId) { params.push(excludeId); sql += ` AND id <> $3`; }
  sql += ' LIMIT 1';
  const { rowCount } = await client.query(sql, params);
  return (rowCount ?? 0) > 0;
}

/** Clear the default flag on every schedule except (optionally) one. */
export async function clearDefault(client: TenantClient, exceptId?: string): Promise<void> {
  const params: any[] = [client.tenantId];
  let sql = `UPDATE pay_schedules SET is_default = false, updated_at = now()
              WHERE tenant_id = $1 AND is_default = true AND deleted_at IS NULL`;
  if (exceptId) { params.push(exceptId); sql += ` AND id <> $2`; }
  await client.query(sql, params);
}

export interface UpdateScheduleData {
  name?: string;
  code?: string;
  frequency?: PayFrequency;
  cycleStartDay?: number;
  cycleEndDay?: number;
  payDay?: number;
  payInNextMonth?: boolean;
  isDefault?: boolean;
  description?: string | null;
  isActive?: boolean;
  updatedBy: string;
}

const COLUMN_MAP: Record<string, string> = {
  name: 'name',
  code: 'code',
  frequency: 'frequency',
  cycleStartDay: 'cycle_start_day',
  cycleEndDay: 'cycle_end_day',
  payDay: 'pay_day',
  payInNextMonth: 'pay_in_next_month',
  isDefault: 'is_default',
  description: 'description',
  isActive: 'is_active',
};

export async function update(client: TenantClient, id: string, data: UpdateScheduleData): Promise<PaySchedule | null> {
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
  const { rows } = await client.query<ScheduleRow>(
    `UPDATE pay_schedules SET ${sets.join(', ')}
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING ${COLS}`,
    params
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function softDelete(client: TenantClient, id: string, deletedBy: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE pay_schedules SET deleted_at = now(), is_default = false, updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, deletedBy]
  );
  return (rowCount ?? 0) > 0;
}

/** Count non-deleted groups pointing at this schedule (delete guard). */
export async function countGroups(client: TenantClient, scheduleId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM pay_groups WHERE tenant_id = $1 AND schedule_id = $2 AND deleted_at IS NULL`,
    [client.tenantId, scheduleId]
  );
  return rows[0].n as number;
}
