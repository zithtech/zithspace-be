// src/modules/leave-v2/repositories/leavePolicy.repo.ts
//
// Raw-SQL data access for leave policies (header + assignments + lines).
// Every query takes a tenant-scoped client AND filters tenant_id explicitly.

import { TenantClient } from '../db/pool';
import {
  LeavePolicy,
  LeavePolicyAssignment,
  LeavePolicyLine,
  LeavePolicyListItem,
  PolicyScopeType,
} from '../types';

// ── Header ────────────────────────────────────────────────────────────────────
const POLICY_COLS = `
  id, tenant_id, name, code, description, is_active, term_cycle, lop_on_exhaustion,
  created_by, updated_by, created_at, updated_at
`;

function mapPolicy(r: any): LeavePolicy {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    code: r.code,
    description: r.description,
    isActive: r.is_active,
    termCycle: r.term_cycle,
    lopOnExhaustion: r.lop_on_exhaustion,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface PolicyHeaderData {
  name: string;
  code: string;
  description?: string | null;
  isActive: boolean;
  termCycle: string;
  lopOnExhaustion: boolean;
}

export async function insertPolicy(
  client: TenantClient,
  data: PolicyHeaderData,
  actorId: string
): Promise<LeavePolicy> {
  const { rows } = await client.query(
    `INSERT INTO lv2_leave_policies
       (tenant_id, name, code, description, is_active, term_cycle, lop_on_exhaustion, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
     RETURNING ${POLICY_COLS}`,
    [client.tenantId, data.name, data.code, data.description ?? null, data.isActive, data.termCycle, data.lopOnExhaustion, actorId]
  );
  return mapPolicy(rows[0]);
}

export async function updatePolicyHeader(
  client: TenantClient,
  id: string,
  data: PolicyHeaderData,
  actorId: string
): Promise<LeavePolicy | null> {
  const { rows } = await client.query(
    `UPDATE lv2_leave_policies
        SET name = $3, code = $4, description = $5, is_active = $6,
            term_cycle = $7, lop_on_exhaustion = $8, updated_by = $9, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING ${POLICY_COLS}`,
    [client.tenantId, id, data.name, data.code, data.description ?? null, data.isActive, data.termCycle, data.lopOnExhaustion, actorId]
  );
  return rows[0] ? mapPolicy(rows[0]) : null;
}

export async function findPolicyById(
  client: TenantClient,
  id: string
): Promise<LeavePolicy | null> {
  const { rows } = await client.query(
    `SELECT ${POLICY_COLS} FROM lv2_leave_policies
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return rows[0] ? mapPolicy(rows[0]) : null;
}

export async function listPolicies(
  client: TenantClient,
  opts: {
    includeInactive?: boolean;
    search?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ data: LeavePolicyListItem[]; total: number }> {
  const conditions = ['p.tenant_id = $1', 'p.deleted_at IS NULL'];
  const params: any[] = [client.tenantId];

  // Old behavior compatibility for includeInactive if status is not explicitly provided
  if (!opts.includeInactive && opts.status !== 'inactive' && opts.status !== 'all') {
    conditions.push('p.is_active = true');
  }

  // Handle explicit filters
  if (opts.status === 'active') {
    conditions.push('p.is_active = true');
  } else if (opts.status === 'inactive') {
    conditions.push('p.is_active = false');
  }

  if (opts.search) {
    params.push(`%${opts.search}%`);
    conditions.push(`(p.name ILIKE $${params.length} OR p.code ILIKE $${params.length})`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  
  // Get total count
  const countRes = await client.query(`SELECT COUNT(*) FROM lv2_leave_policies p ${where}`, params);
  const total = parseInt(countRes.rows[0].count, 10);

  // Build main query
  let sql = `SELECT ${POLICY_COLS.split(',').map((c) => 'p.' + c.trim()).join(', ')},
            (SELECT count(*) FROM lv2_leave_policy_assignments a WHERE a.policy_id = p.id) AS assignment_count,
            (SELECT count(*) FROM lv2_leave_policy_lines l WHERE l.policy_id = p.id) AS line_count
       FROM lv2_leave_policies p
      ${where}
      ORDER BY p.name ASC`;

  if (opts.limit !== undefined) {
    params.push(opts.limit);
    sql += ` LIMIT $${params.length}`;
  }
  if (opts.offset !== undefined) {
    params.push(opts.offset);
    sql += ` OFFSET $${params.length}`;
  }

  const { rows } = await client.query(sql, params);
  
  const data = rows.map((r) => ({
    ...mapPolicy(r),
    assignmentCount: Number(r.assignment_count),
    lineCount: Number(r.line_count),
  }));

  return { data, total };
}

export async function existsByCode(
  client: TenantClient,
  code: string,
  excludeId?: string
): Promise<boolean> {
  const params: any[] = [client.tenantId, code];
  let sql = `SELECT 1 FROM lv2_leave_policies
              WHERE tenant_id = $1 AND lower(code) = lower($2) AND deleted_at IS NULL`;
  if (excludeId) {
    params.push(excludeId);
    sql += ` AND id <> $3`;
  }
  sql += ' LIMIT 1';
  const { rowCount } = await client.query(sql, params);
  return rowCount > 0;
}

export async function softDeletePolicy(
  client: TenantClient,
  id: string,
  actorId: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE lv2_leave_policies
        SET deleted_at = now(), updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, actorId]
  );
  return rowCount > 0;
}

// ── Assignments ───────────────────────────────────────────────────────────────
export interface AssignmentInput {
  scopeType: PolicyScopeType;
  scopeId?: string | null;
}

export async function findAssignments(
  client: TenantClient,
  policyId: string
): Promise<LeavePolicyAssignment[]> {
  const { rows } = await client.query(
    `SELECT id, policy_id, scope_type, scope_id
       FROM lv2_leave_policy_assignments
      WHERE tenant_id = $1 AND policy_id = $2
      ORDER BY scope_type, scope_id`,
    [client.tenantId, policyId]
  );
  return rows.map((r) => ({
    id: r.id,
    policyId: r.policy_id,
    scopeType: r.scope_type,
    scopeId: r.scope_id,
  }));
}

/** Delete all assignments for a policy, then insert the provided set. */
export async function replaceAssignments(
  client: TenantClient,
  policyId: string,
  assignments: AssignmentInput[]
): Promise<void> {
  await client.query(
    `DELETE FROM lv2_leave_policy_assignments WHERE tenant_id = $1 AND policy_id = $2`,
    [client.tenantId, policyId]
  );
  for (const a of assignments) {
    await client.query(
      `INSERT INTO lv2_leave_policy_assignments (tenant_id, policy_id, scope_type, scope_id)
       VALUES ($1, $2, $3, $4)`,
      [client.tenantId, policyId, a.scopeType, a.scopeType === 'org' ? null : a.scopeId ?? null]
    );
  }
}

// ── Lines ─────────────────────────────────────────────────────────────────────
export interface LineInput {
  leaveTypeId: string;
  accrualMethod: string;
  countPerPeriod: number;
  /** Derived total per term — computed by the service from the term cycle. */
  allocation: number;
  carryForward: boolean;
  carryForwardMax?: number | null;
}

export async function findLines(
  client: TenantClient,
  policyId: string
): Promise<LeavePolicyLine[]> {
  const { rows } = await client.query(
    `SELECT id, policy_id, leave_type_id, accrual_method, count_per_period,
            allocation, carry_forward, carry_forward_max
       FROM lv2_leave_policy_lines
      WHERE tenant_id = $1 AND policy_id = $2
      ORDER BY created_at ASC`,
    [client.tenantId, policyId]
  );
  return rows.map((r) => ({
    id: r.id,
    policyId: r.policy_id,
    leaveTypeId: r.leave_type_id,
    accrualMethod: r.accrual_method,
    countPerPeriod: Number(r.count_per_period),
    allocation: Number(r.allocation),
    carryForward: r.carry_forward,
    carryForwardMax: r.carry_forward_max == null ? null : Number(r.carry_forward_max),
  }));
}

/** Delete all lines for a policy, then insert the provided set. */
export async function replaceLines(
  client: TenantClient,
  policyId: string,
  lines: LineInput[]
): Promise<void> {
  await client.query(
    `DELETE FROM lv2_leave_policy_lines WHERE tenant_id = $1 AND policy_id = $2`,
    [client.tenantId, policyId]
  );
  for (const l of lines) {
    await client.query(
      `INSERT INTO lv2_leave_policy_lines
         (tenant_id, policy_id, leave_type_id, accrual_method, count_per_period,
          allocation, carry_forward, carry_forward_max)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        client.tenantId,
        policyId,
        l.leaveTypeId,
        l.accrualMethod,
        l.countPerPeriod,
        l.allocation,
        l.carryForward,
        l.carryForward ? l.carryForwardMax ?? null : null,
      ]
    );
  }
}
