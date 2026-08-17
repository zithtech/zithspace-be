// src/modules/payroll/repositories/structure.repo.ts
//
// Raw-SQL data access for salary structures (header + component lines).
// Every query takes a tenant-scoped client AND filters tenant_id explicitly.

import { TenantClient } from '../db/pool';
import {
  ComponentCategory,
  ComponentPercentageOf,
  PayStructure,
  PayStructureListItem,
  StructureCalcType,
} from '../types';

// ── Header ──────────────────────────────────────────────────────────────────
const STRUCT_COLS = `
  id, tenant_id, name, code, description, monthly_ctc, is_active,
  created_by, updated_by, created_at, updated_at
`;

function mapStructure(r: any): PayStructure {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    code: r.code,
    description: r.description,
    monthlyCtc: Number(r.monthly_ctc),
    isActive: r.is_active,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface StructureHeaderData {
  name: string;
  code: string;
  description?: string | null;
  monthlyCtc: number;
  isActive: boolean;
}

export async function insertStructure(
  client: TenantClient,
  data: StructureHeaderData,
  actorId: string
): Promise<PayStructure> {
  const { rows } = await client.query(
    `INSERT INTO pay_structures
       (tenant_id, name, code, description, monthly_ctc, is_active, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     RETURNING ${STRUCT_COLS}`,
    [client.tenantId, data.name, data.code, data.description ?? null, data.monthlyCtc, data.isActive, actorId]
  );
  return mapStructure(rows[0]);
}

export async function updateStructureHeader(
  client: TenantClient,
  id: string,
  data: StructureHeaderData,
  actorId: string
): Promise<PayStructure | null> {
  const { rows } = await client.query(
    `UPDATE pay_structures
        SET name = $3, code = $4, description = $5, monthly_ctc = $6,
            is_active = $7, updated_by = $8, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING ${STRUCT_COLS}`,
    [client.tenantId, id, data.name, data.code, data.description ?? null, data.monthlyCtc, data.isActive, actorId]
  );
  return rows[0] ? mapStructure(rows[0]) : null;
}

export async function findStructureById(client: TenantClient, id: string): Promise<PayStructure | null> {
  const { rows } = await client.query(
    `SELECT ${STRUCT_COLS} FROM pay_structures
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return rows[0] ? mapStructure(rows[0]) : null;
}

export async function listStructures(
  client: TenantClient,
  opts: { includeInactive?: boolean; page?: number; limit?: number; search?: string } = {}
): Promise<{ data: PayStructureListItem[]; total: number }> {
  const conditions = ['s.tenant_id = $1', 's.deleted_at IS NULL'];
  const params: any[] = [client.tenantId];

  if (!opts.includeInactive) {
    conditions.push('s.is_active = true');
  }

  if (opts.search) {
    params.push(`%${opts.search}%`);
    conditions.push(`(s.name ILIKE $${params.length} OR s.code ILIKE $${params.length})`);
  }

  const countResult = await client.query(
    `SELECT COUNT(*) AS total FROM pay_structures s WHERE ${conditions.join(' AND ')}`,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const page = opts.page ?? 1;
  const limit = opts.limit ?? 20;
  const offset = (page - 1) * limit;

  params.push(limit, offset);

  const { rows } = await client.query(
    `SELECT ${STRUCT_COLS.split(',').map((c) => 's.' + c.trim()).join(', ')},
            (SELECT count(*) FROM pay_structure_components c WHERE c.structure_id = s.id) AS component_count
       FROM pay_structures s
      WHERE ${conditions.join(' AND ')}
      ORDER BY s.name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { data: rows.map((r) => ({ ...mapStructure(r), componentCount: Number(r.component_count) })), total };
}

export async function existsByCode(
  client: TenantClient,
  code: string,
  excludeId?: string
): Promise<boolean> {
  const params: any[] = [client.tenantId, code];
  let sql = `SELECT 1 FROM pay_structures
              WHERE tenant_id = $1 AND lower(code) = lower($2) AND deleted_at IS NULL`;
  if (excludeId) {
    params.push(excludeId);
    sql += ` AND id <> $3`;
  }
  sql += ' LIMIT 1';
  const { rowCount } = await client.query(sql, params);
  return (rowCount ?? 0) > 0;
}

export async function softDeleteStructure(
  client: TenantClient,
  id: string,
  actorId: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE pay_structures
        SET deleted_at = now(), updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, actorId]
  );
  return (rowCount ?? 0) > 0;
}

// ── Lines ───────────────────────────────────────────────────────────────────
export interface StructureLineInput {
  componentId: string;
  calculationType: StructureCalcType;
  percentageOf: ComponentPercentageOf | null;
  value: number;
  displayOrder: number;
}

/** A line joined to its pay_components meta (code/name/category). */
export interface StructureLineRow {
  id: string;
  structureId: string;
  componentId: string;
  code: string;
  name: string;
  category: ComponentCategory;
  calculationType: StructureCalcType;
  percentageOf: ComponentPercentageOf | null;
  value: number;
  displayOrder: number;
}

export async function findLines(client: TenantClient, structureId: string): Promise<StructureLineRow[]> {
  const { rows } = await client.query(
    `SELECT sc.id, sc.structure_id, sc.component_id, sc.calculation_type,
            sc.percentage_of, sc.value, sc.display_order,
            c.code, c.name, c.category
       FROM pay_structure_components sc
       JOIN pay_components c ON c.id = sc.component_id AND c.tenant_id = sc.tenant_id
      WHERE sc.tenant_id = $1 AND sc.structure_id = $2
      ORDER BY sc.display_order ASC, c.name ASC`,
    [client.tenantId, structureId]
  );
  return rows.map((r) => ({
    id: r.id,
    structureId: r.structure_id,
    componentId: r.component_id,
    code: r.code,
    name: r.name,
    category: r.category,
    calculationType: r.calculation_type,
    percentageOf: r.percentage_of,
    value: Number(r.value),
    displayOrder: r.display_order,
  }));
}

/** Delete all lines for a structure, then insert the provided set. */
export async function replaceLines(
  client: TenantClient,
  structureId: string,
  lines: StructureLineInput[]
): Promise<void> {
  await client.query(
    `DELETE FROM pay_structure_components WHERE tenant_id = $1 AND structure_id = $2`,
    [client.tenantId, structureId]
  );
  for (const l of lines) {
    await client.query(
      `INSERT INTO pay_structure_components
         (tenant_id, structure_id, component_id, calculation_type, percentage_of, value, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        client.tenantId,
        structureId,
        l.componentId,
        l.calculationType,
        l.calculationType === 'percentage' ? l.percentageOf ?? null : null,
        l.value,
        l.displayOrder,
      ]
    );
  }
}

/** Validate that all componentIds belong to live (non-deleted) tenant components. */
export async function countLiveComponents(
  client: TenantClient,
  componentIds: string[]
): Promise<number> {
  if (componentIds.length === 0) return 0;
  const { rowCount } = await client.query(
    `SELECT 1 FROM pay_components
      WHERE tenant_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])`,
    [client.tenantId, componentIds]
  );
  return rowCount ?? 0;
}

/** Minimal component meta (code/category) for the given ids — used by preview. */
export interface ComponentMeta {
  id: string;
  code: string;
  category: ComponentCategory;
}

export async function findComponentsMeta(
  client: TenantClient,
  componentIds: string[]
): Promise<ComponentMeta[]> {
  if (componentIds.length === 0) return [];
  const { rows } = await client.query(
    `SELECT id, code, category FROM pay_components
      WHERE tenant_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])`,
    [client.tenantId, componentIds]
  );
  return rows.map((r) => ({ id: r.id, code: r.code, category: r.category }));
}
