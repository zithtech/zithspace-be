// src/modules/leave-v2/repositories/holidayCatalog.repo.ts
//
// Global holiday catalog (lv2_holiday_catalog) — reference data, NOT tenant
// scoped. Tenants browse it and copy entries into their own lv2_holidays.

import { TenantClient } from '../db/pool';

export interface CatalogHoliday {
  id: string;
  country: string;
  name: string;
  states: string[];
  districts: string[];
  fromDate: string;
  toDate: string;
  type: string;
  rule: string;
}

const COLS = `
  id, country, name, states, districts,
  to_char(from_date, 'YYYY-MM-DD') AS from_date,
  to_char(to_date, 'YYYY-MM-DD')   AS to_date,
  type, rule
`;

function mapRow(r: any): CatalogHoliday {
  return {
    id: r.id,
    country: r.country,
    name: r.name,
    states: r.states ?? [],
    districts: r.districts ?? [],
    fromDate: r.from_date,
    toDate: r.to_date,
    type: r.type,
    rule: r.rule,
  };
}

export async function countries(client: TenantClient): Promise<string[]> {
  const { rows } = await client.query(`SELECT DISTINCT country FROM lv2_holiday_catalog ORDER BY country`);
  return rows.map((r) => r.country);
}

export async function listByCountry(
  client: TenantClient,
  country: string,
  opts: { search?: string; type?: string; limit?: number; offset?: number } = {}
): Promise<{ data: CatalogHoliday[]; total: number }> {
  const conditions = ['country = $1'];
  const params: any[] = [country];
  
  if (opts.search) {
    params.push(`%${opts.search}%`);
    conditions.push(`name ILIKE $${params.length}`);
  }
  
  if (opts.type) {
    if (opts.type === 'National') {
      params.push('ALL');
      conditions.push(`type = $${params.length}`);
    } else {
      params.push(opts.type);
      conditions.push(`type = $${params.length}`);
    }
  }
  
  const where = `WHERE ${conditions.join(' AND ')}`;
  
  // Get total count
  const countRes = await client.query(`SELECT COUNT(*) FROM lv2_holiday_catalog ${where}`, params);
  const total = parseInt(countRes.rows[0].count, 10);
  
  // Build main query
  let sql = `SELECT ${COLS} FROM lv2_holiday_catalog ${where} ORDER BY from_date ASC`;
  
  if (opts.limit !== undefined) {
    params.push(opts.limit);
    sql += ` LIMIT $${params.length}`;
  }
  if (opts.offset !== undefined) {
    params.push(opts.offset);
    sql += ` OFFSET $${params.length}`;
  }
  
  const { rows } = await client.query(sql, params);
  return { data: rows.map(mapRow), total };
}

export async function getByIds(client: TenantClient, ids: string[]): Promise<CatalogHoliday[]> {
  if (ids.length === 0) return [];
  const { rows } = await client.query(
    `SELECT ${COLS} FROM lv2_holiday_catalog WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  return rows.map(mapRow);
}
