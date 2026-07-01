// src/modules/payroll/repositories/statutoryState.repo.ts
//
// Raw-SQL data access for Professional Tax (state + slabs) and LWF (per state).
// Every query takes a tenant-scoped client AND filters tenant_id explicitly.

import { TenantClient } from '../db/pool';
import { LwfFrequency, LwfState, PtSlab, PtState, PtStateListItem } from '../types';

// ══ Professional Tax ═════════════════════════════════════════════════════════
const PT_COLS = `id, tenant_id, state, is_active, created_by, updated_by, created_at, updated_at`;

function mapPtState(r: any): PtState {
  return {
    id: r.id, tenantId: r.tenant_id, state: r.state, isActive: r.is_active,
    createdBy: r.created_by, updatedBy: r.updated_by, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export async function insertPtState(client: TenantClient, state: string, isActive: boolean, actorId: string): Promise<PtState> {
  const { rows } = await client.query(
    `INSERT INTO pay_pt_states (tenant_id, state, is_active, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$4) RETURNING ${PT_COLS}`,
    [client.tenantId, state, isActive, actorId]
  );
  return mapPtState(rows[0]);
}

export async function updatePtStateHeader(client: TenantClient, id: string, state: string, isActive: boolean, actorId: string): Promise<PtState | null> {
  const { rows } = await client.query(
    `UPDATE pay_pt_states SET state = $3, is_active = $4, updated_by = $5, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING ${PT_COLS}`,
    [client.tenantId, id, state, isActive, actorId]
  );
  return rows[0] ? mapPtState(rows[0]) : null;
}

export async function findPtStateById(client: TenantClient, id: string): Promise<PtState | null> {
  const { rows } = await client.query(
    `SELECT ${PT_COLS} FROM pay_pt_states WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return rows[0] ? mapPtState(rows[0]) : null;
}

export async function listPtStates(client: TenantClient, includeInactive: boolean): Promise<PtStateListItem[]> {
  const conditions = ['s.tenant_id = $1', 's.deleted_at IS NULL'];
  if (!includeInactive) conditions.push('s.is_active = true');
  const { rows } = await client.query(
    `SELECT ${PT_COLS.split(',').map((c) => 's.' + c.trim()).join(', ')},
            (SELECT count(*) FROM pay_pt_slabs sl WHERE sl.pt_state_id = s.id) AS slab_count
       FROM pay_pt_states s
      WHERE ${conditions.join(' AND ')}
      ORDER BY s.state ASC`,
    [client.tenantId]
  );
  return rows.map((r) => ({ ...mapPtState(r), slabCount: Number(r.slab_count) }));
}

export async function ptStateExistsByName(client: TenantClient, state: string, excludeId?: string): Promise<boolean> {
  const params: any[] = [client.tenantId, state];
  let sql = `SELECT 1 FROM pay_pt_states WHERE tenant_id = $1 AND lower(state) = lower($2) AND deleted_at IS NULL`;
  if (excludeId) { params.push(excludeId); sql += ` AND id <> $3`; }
  sql += ' LIMIT 1';
  const { rowCount } = await client.query(sql, params);
  return (rowCount ?? 0) > 0;
}

export async function softDeletePtState(client: TenantClient, id: string, actorId: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE pay_pt_states SET deleted_at = now(), updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, actorId]
  );
  return (rowCount ?? 0) > 0;
}

export interface PtSlabInput {
  fromAmount: number;
  toAmount: number | null;
  monthlyAmount: number;
  displayOrder: number;
}

export async function findPtSlabs(client: TenantClient, ptStateId: string): Promise<PtSlab[]> {
  const { rows } = await client.query(
    `SELECT id, pt_state_id, from_amount, to_amount, monthly_amount, display_order
       FROM pay_pt_slabs WHERE tenant_id = $1 AND pt_state_id = $2
      ORDER BY display_order ASC, from_amount ASC`,
    [client.tenantId, ptStateId]
  );
  return rows.map((r) => ({
    id: r.id, ptStateId: r.pt_state_id,
    fromAmount: Number(r.from_amount),
    toAmount: r.to_amount == null ? null : Number(r.to_amount),
    monthlyAmount: Number(r.monthly_amount),
    displayOrder: r.display_order,
  }));
}

export async function replacePtSlabs(client: TenantClient, ptStateId: string, slabs: PtSlabInput[]): Promise<void> {
  await client.query(`DELETE FROM pay_pt_slabs WHERE tenant_id = $1 AND pt_state_id = $2`, [client.tenantId, ptStateId]);
  for (const s of slabs) {
    await client.query(
      `INSERT INTO pay_pt_slabs (tenant_id, pt_state_id, from_amount, to_amount, monthly_amount, display_order)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [client.tenantId, ptStateId, s.fromAmount, s.toAmount, s.monthlyAmount, s.displayOrder]
    );
  }
}

// ══ LWF ══════════════════════════════════════════════════════════════════════
const LWF_COLS = `id, tenant_id, state, employee_amount, employer_amount, frequency, is_active, created_by, updated_by, created_at, updated_at`;

function mapLwf(r: any): LwfState {
  return {
    id: r.id, tenantId: r.tenant_id, state: r.state,
    employeeAmount: Number(r.employee_amount), employerAmount: Number(r.employer_amount),
    frequency: r.frequency, isActive: r.is_active,
    createdBy: r.created_by, updatedBy: r.updated_by, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export interface CreateLwfData {
  state: string;
  employeeAmount: number;
  employerAmount: number;
  frequency: LwfFrequency;
  isActive: boolean;
  createdBy: string;
}

export async function insertLwf(client: TenantClient, d: CreateLwfData): Promise<LwfState> {
  const { rows } = await client.query(
    `INSERT INTO pay_lwf_states (tenant_id, state, employee_amount, employer_amount, frequency, is_active, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING ${LWF_COLS}`,
    [client.tenantId, d.state, d.employeeAmount, d.employerAmount, d.frequency, d.isActive, d.createdBy]
  );
  return mapLwf(rows[0]);
}

export async function findLwfById(client: TenantClient, id: string): Promise<LwfState | null> {
  const { rows } = await client.query(`SELECT ${LWF_COLS} FROM pay_lwf_states WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`, [client.tenantId, id]);
  return rows[0] ? mapLwf(rows[0]) : null;
}

export async function listLwf(client: TenantClient, includeInactive: boolean): Promise<LwfState[]> {
  const conditions = ['tenant_id = $1', 'deleted_at IS NULL'];
  if (!includeInactive) conditions.push('is_active = true');
  const { rows } = await client.query(
    `SELECT ${LWF_COLS} FROM pay_lwf_states WHERE ${conditions.join(' AND ')} ORDER BY state ASC`,
    [client.tenantId]
  );
  return rows.map(mapLwf);
}

export async function lwfExistsByName(client: TenantClient, state: string, excludeId?: string): Promise<boolean> {
  const params: any[] = [client.tenantId, state];
  let sql = `SELECT 1 FROM pay_lwf_states WHERE tenant_id = $1 AND lower(state) = lower($2) AND deleted_at IS NULL`;
  if (excludeId) { params.push(excludeId); sql += ` AND id <> $3`; }
  sql += ' LIMIT 1';
  const { rowCount } = await client.query(sql, params);
  return (rowCount ?? 0) > 0;
}

const LWF_COLUMN_MAP: Record<string, string> = {
  state: 'state', employeeAmount: 'employee_amount', employerAmount: 'employer_amount',
  frequency: 'frequency', isActive: 'is_active',
};

export async function updateLwf(client: TenantClient, id: string, data: Record<string, any>, actorId: string): Promise<LwfState | null> {
  const sets: string[] = [];
  const params: any[] = [client.tenantId, id];
  for (const [key, column] of Object.entries(LWF_COLUMN_MAP)) {
    if (key in data && data[key] !== undefined) { params.push(data[key]); sets.push(`${column} = $${params.length}`); }
  }
  params.push(actorId);
  sets.push(`updated_by = $${params.length}`);
  sets.push('updated_at = now()');
  const { rows } = await client.query(
    `UPDATE pay_lwf_states SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING ${LWF_COLS}`,
    params
  );
  return rows[0] ? mapLwf(rows[0]) : null;
}

export async function softDeleteLwf(client: TenantClient, id: string, actorId: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE pay_lwf_states SET deleted_at = now(), updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, actorId]
  );
  return (rowCount ?? 0) > 0;
}
