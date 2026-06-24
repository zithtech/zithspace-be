// src/modules/leave-v2/repositories/holiday.repo.ts
// Raw-SQL data access for lv2_holidays. Tenant-scoped + explicit tenant filter.

import { TenantClient } from '../db/pool';

export interface Holiday {
  id: string;
  tenantId: string;
  name: string;
  country: string;
  states: string[];
  districts: string[];
  fromDate: string;
  toDate: string;
  type: string;
  rule: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const COLS = `
  id, tenant_id, name, country, states, districts,
  to_char(from_date, 'YYYY-MM-DD') AS from_date,
  to_char(to_date, 'YYYY-MM-DD')   AS to_date,
  type, rule, is_active, created_at, updated_at
`;

function mapRow(r: any): Holiday {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    country: r.country,
    states: r.states ?? [],
    districts: r.districts ?? [],
    fromDate: r.from_date,
    toDate: r.to_date,
    type: r.type,
    rule: r.rule,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function findAll(
  client: TenantClient,
  opts: { year?: number; includeInactive?: boolean } = {}
): Promise<Holiday[]> {
  const conditions = ['tenant_id = $1', 'deleted_at IS NULL'];
  const params: any[] = [client.tenantId];
  if (!opts.includeInactive) conditions.push('is_active = true');
  if (opts.year) {
    params.push(opts.year);
    conditions.push(`EXTRACT(YEAR FROM from_date) = $${params.length}`);
  }
  const { rows } = await client.query(
    `SELECT ${COLS} FROM lv2_holidays WHERE ${conditions.join(' AND ')} ORDER BY from_date ASC`,
    params
  );
  return rows.map(mapRow);
}

export async function findById(client: TenantClient, id: string): Promise<Holiday | null> {
  const { rows } = await client.query(
    `SELECT ${COLS} FROM lv2_holidays WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export interface HolidayData {
  name: string;
  country: string;
  states: string[];
  districts: string[];
  fromDate: string;
  toDate: string;
  type: string;
  rule: string;
  isActive: boolean;
}

export async function insert(client: TenantClient, d: HolidayData, actorId: string): Promise<Holiday> {
  const { rows } = await client.query(
    `INSERT INTO lv2_holidays
       (tenant_id, name, country, states, districts, from_date, to_date, type, rule, is_active, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
     RETURNING ${COLS}`,
    [client.tenantId, d.name, d.country, d.states, d.districts, d.fromDate, d.toDate, d.type, d.rule, d.isActive, actorId]
  );
  return mapRow(rows[0]);
}

export async function update(client: TenantClient, id: string, d: HolidayData, actorId: string): Promise<Holiday | null> {
  const { rows } = await client.query(
    `UPDATE lv2_holidays
        SET name=$3, country=$4, states=$5, districts=$6, from_date=$7, to_date=$8, type=$9, rule=$10, is_active=$11,
            updated_by=$12, updated_at=now()
      WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL
      RETURNING ${COLS}`,
    [client.tenantId, id, d.name, d.country, d.states, d.districts, d.fromDate, d.toDate, d.type, d.rule, d.isActive, actorId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * Holiday dates (YYYY-MM-DD) within [fromDate, toDate], expanding multi-day
 * holidays. Treats the tenant's active holidays as the company-wide calendar.
 */
export async function holidayDatesInRange(client: TenantClient, fromDate: string, toDate: string): Promise<Set<string>> {
  const { rows } = await client.query(
    `SELECT DISTINCT to_char(g.d, 'YYYY-MM-DD') AS dt
       FROM lv2_holidays h,
            LATERAL generate_series(GREATEST(h.from_date, $2::date), LEAST(h.to_date, $3::date), interval '1 day') g(d)
      WHERE h.tenant_id = $1 AND h.deleted_at IS NULL AND h.is_active = true
        AND h.from_date <= $3::date AND h.to_date >= $2::date`,
    [client.tenantId, fromDate, toDate]
  );
  return new Set(rows.map((r) => r.dt as string));
}

/** All active holiday dates for the tenant (expanded) — for the apply-leave preview. */
export async function allActiveHolidayDates(client: TenantClient): Promise<string[]> {
  const { rows } = await client.query(
    `SELECT DISTINCT to_char(g.d, 'YYYY-MM-DD') AS dt
       FROM lv2_holidays h,
            LATERAL generate_series(h.from_date, h.to_date, interval '1 day') g(d)
      WHERE h.tenant_id = $1 AND h.deleted_at IS NULL AND h.is_active = true
      ORDER BY dt`,
    [client.tenantId]
  );
  return rows.map((r) => r.dt as string);
}

export async function softDelete(client: TenantClient, id: string, actorId: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE lv2_holidays SET deleted_at=now(), updated_by=$3, updated_at=now()
      WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL`,
    [client.tenantId, id, actorId]
  );
  return rowCount > 0;
}
