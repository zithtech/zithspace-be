// src/modules/payroll/repositories/component.repo.ts
//
// Raw-SQL data access for pay_components. This layer ONLY builds parameterized
// queries and maps rows — no business rules, no HTTP.
//
// Every query takes a TenantClient (already scoped via withTenant) AND filters
// `tenant_id = $1` explicitly (belt + suspenders over RLS).

import { TenantClient } from '../db/pool';
import {
  ComponentCalcType,
  ComponentCategory,
  ComponentPercentageOf,
  PayComponent,
} from '../types';

interface ComponentRow {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  category: ComponentCategory;
  calculation_type: ComponentCalcType;
  percentage_of: ComponentPercentageOf | null;
  default_value: string | null; // numeric → string from pg
  is_taxable: boolean;
  is_pro_rata: boolean;
  part_of_ctc: boolean;
  consider_for_pf: boolean;
  consider_for_esi: boolean;
  show_on_payslip: boolean;
  display_order: number;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

const SELECT_COLS = `
  id, tenant_id, name, code, category, calculation_type, percentage_of,
  default_value, is_taxable, is_pro_rata, part_of_ctc, consider_for_pf,
  consider_for_esi, show_on_payslip, display_order, description, is_active,
  created_by, updated_by, created_at, updated_at
`;

function mapRow(row: ComponentRow): PayComponent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    code: row.code,
    category: row.category,
    calculationType: row.calculation_type,
    percentageOf: row.percentage_of,
    defaultValue: row.default_value === null ? null : Number(row.default_value),
    isTaxable: row.is_taxable,
    isProRata: row.is_pro_rata,
    partOfCtc: row.part_of_ctc,
    considerForPf: row.consider_for_pf,
    considerForEsi: row.consider_for_esi,
    showOnPayslip: row.show_on_payslip,
    displayOrder: row.display_order,
    description: row.description,
    isActive: row.is_active,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateComponentData {
  name: string;
  code: string;
  category: ComponentCategory;
  calculationType: ComponentCalcType;
  percentageOf: ComponentPercentageOf | null;
  defaultValue: number | null;
  isTaxable: boolean;
  isProRata: boolean;
  partOfCtc: boolean;
  considerForPf: boolean;
  considerForEsi: boolean;
  showOnPayslip: boolean;
  displayOrder: number;
  description: string | null;
  isActive: boolean;
  createdBy: string;
}

export async function insert(client: TenantClient, data: CreateComponentData): Promise<PayComponent> {
  const { rows } = await client.query<ComponentRow>(
    `INSERT INTO pay_components
       (tenant_id, name, code, category, calculation_type, percentage_of,
        default_value, is_taxable, is_pro_rata, part_of_ctc, consider_for_pf,
        consider_for_esi, show_on_payslip, display_order, description, is_active,
        created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17)
     RETURNING ${SELECT_COLS}`,
    [
      client.tenantId,
      data.name,
      data.code,
      data.category,
      data.calculationType,
      data.percentageOf,
      data.defaultValue,
      data.isTaxable,
      data.isProRata,
      data.partOfCtc,
      data.considerForPf,
      data.considerForEsi,
      data.showOnPayslip,
      data.displayOrder,
      data.description,
      data.isActive,
      data.createdBy,
    ]
  );
  return mapRow(rows[0]);
}

export async function findAll(
  client: TenantClient,
  opts: { includeInactive?: boolean; category?: ComponentCategory } = {}
): Promise<PayComponent[]> {
  const conditions = ['tenant_id = $1', 'deleted_at IS NULL'];
  const params: any[] = [client.tenantId];
  if (!opts.includeInactive) {
    conditions.push('is_active = true');
  }
  if (opts.category) {
    params.push(opts.category);
    conditions.push(`category = $${params.length}`);
  }
  const { rows } = await client.query<ComponentRow>(
    `SELECT ${SELECT_COLS}
       FROM pay_components
      WHERE ${conditions.join(' AND ')}
      ORDER BY display_order ASC, name ASC`,
    params
  );
  return rows.map(mapRow);
}

export async function findById(client: TenantClient, id: string): Promise<PayComponent | null> {
  const { rows } = await client.query<ComponentRow>(
    `SELECT ${SELECT_COLS}
       FROM pay_components
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** True if a non-deleted component with this code exists. `excludeId` skips a row. */
export async function existsByCode(
  client: TenantClient,
  code: string,
  excludeId?: string
): Promise<boolean> {
  const params: any[] = [client.tenantId, code];
  let sql = `SELECT 1 FROM pay_components
              WHERE tenant_id = $1 AND lower(code) = lower($2) AND deleted_at IS NULL`;
  if (excludeId) {
    params.push(excludeId);
    sql += ` AND id <> $3`;
  }
  sql += ' LIMIT 1';
  const { rowCount } = await client.query(sql, params);
  return (rowCount ?? 0) > 0;
}

export interface UpdateComponentData {
  name?: string;
  code?: string;
  category?: ComponentCategory;
  calculationType?: ComponentCalcType;
  percentageOf?: ComponentPercentageOf | null;
  defaultValue?: number | null;
  isTaxable?: boolean;
  isProRata?: boolean;
  partOfCtc?: boolean;
  considerForPf?: boolean;
  considerForEsi?: boolean;
  showOnPayslip?: boolean;
  displayOrder?: number;
  description?: string | null;
  isActive?: boolean;
  updatedBy: string;
}

const COLUMN_MAP: Record<string, string> = {
  name: 'name',
  code: 'code',
  category: 'category',
  calculationType: 'calculation_type',
  percentageOf: 'percentage_of',
  defaultValue: 'default_value',
  isTaxable: 'is_taxable',
  isProRata: 'is_pro_rata',
  partOfCtc: 'part_of_ctc',
  considerForPf: 'consider_for_pf',
  considerForEsi: 'consider_for_esi',
  showOnPayslip: 'show_on_payslip',
  displayOrder: 'display_order',
  description: 'description',
  isActive: 'is_active',
};

/** Dynamic partial update. Returns the updated row, or null if not found. */
export async function update(
  client: TenantClient,
  id: string,
  data: UpdateComponentData
): Promise<PayComponent | null> {
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

  const { rows } = await client.query<ComponentRow>(
    `UPDATE pay_components
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
    `UPDATE pay_components
        SET deleted_at = now(), updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, deletedBy]
  );
  return (rowCount ?? 0) > 0;
}
