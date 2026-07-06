// src/modules/reimbursement-v2/repositories/policy.repo.ts
//
// Raw-SQL data access for reimbursement policies (header + assignments + lines).
// Every query takes a tenant-scoped client AND filters tenant_id explicitly.

import { TenantClient } from '../db/pool';
import {
  PolicyAssignment,
  PolicyLine,
  PolicyScopeType,
  ReimbursementPolicy,
  ReimbursementPolicyListItem,
} from '../types';

const num = (v: string | null): number | null => (v == null ? null : Number(v));

// ── Header ────────────────────────────────────────────────────────────────────
const POLICY_COLS = `
  id, tenant_id, name, code, description, auto_approve_below, is_active,
  created_by, updated_by, created_at, updated_at
`;

function mapPolicy(r: any): ReimbursementPolicy {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    code: r.code,
    description: r.description,
    autoApproveBelow: num(r.auto_approve_below),
    isActive: r.is_active,
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
  autoApproveBelow?: number | null;
  isActive: boolean;
}

export async function insertPolicy(
  client: TenantClient,
  data: PolicyHeaderData,
  actorId: string
): Promise<ReimbursementPolicy> {
  const { rows } = await client.query(
    `INSERT INTO rb2_policies
       (tenant_id, name, code, description, auto_approve_below, is_active, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     RETURNING ${POLICY_COLS}`,
    [
      client.tenantId,
      data.name,
      data.code,
      data.description ?? null,
      data.autoApproveBelow ?? null,
      data.isActive,
      actorId,
    ]
  );
  return mapPolicy(rows[0]);
}

export async function updatePolicyHeader(
  client: TenantClient,
  id: string,
  data: PolicyHeaderData,
  actorId: string
): Promise<ReimbursementPolicy | null> {
  const { rows } = await client.query(
    `UPDATE rb2_policies
        SET name = $3, code = $4, description = $5, auto_approve_below = $6,
            is_active = $7, updated_by = $8, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING ${POLICY_COLS}`,
    [
      client.tenantId,
      id,
      data.name,
      data.code,
      data.description ?? null,
      data.autoApproveBelow ?? null,
      data.isActive,
      actorId,
    ]
  );
  return rows[0] ? mapPolicy(rows[0]) : null;
}

export async function findPolicyById(
  client: TenantClient,
  id: string
): Promise<ReimbursementPolicy | null> {
  const { rows } = await client.query(
    `SELECT ${POLICY_COLS} FROM rb2_policies
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return rows[0] ? mapPolicy(rows[0]) : null;
}

export async function listPolicies(
  client: TenantClient,
  opts: { includeInactive?: boolean } = {}
): Promise<ReimbursementPolicyListItem[]> {
  const conditions = ['p.tenant_id = $1', 'p.deleted_at IS NULL'];
  if (!opts.includeInactive) conditions.push('p.is_active = true');

  const { rows } = await client.query(
    `SELECT ${POLICY_COLS.split(',').map((c) => 'p.' + c.trim()).join(', ')},
            (SELECT count(*) FROM rb2_policy_assignments a WHERE a.policy_id = p.id) AS assignment_count,
            (SELECT count(*) FROM rb2_policy_lines l WHERE l.policy_id = p.id) AS line_count
       FROM rb2_policies p
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.name ASC`,
    [client.tenantId]
  );
  return rows.map((r) => ({
    ...mapPolicy(r),
    assignmentCount: Number(r.assignment_count),
    lineCount: Number(r.line_count),
  }));
}

export async function existsByCode(
  client: TenantClient,
  code: string,
  excludeId?: string
): Promise<boolean> {
  const params: any[] = [client.tenantId, code];
  let sql = `SELECT 1 FROM rb2_policies
              WHERE tenant_id = $1 AND lower(code) = lower($2) AND deleted_at IS NULL`;
  if (excludeId) {
    params.push(excludeId);
    sql += ` AND id <> $3`;
  }
  sql += ' LIMIT 1';
  const { rowCount } = await client.query(sql, params);
  return (rowCount ?? 0) > 0;
}

export async function softDeletePolicy(
  client: TenantClient,
  id: string,
  actorId: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE rb2_policies
        SET deleted_at = now(), updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, actorId]
  );
  return (rowCount ?? 0) > 0;
}

// ── Assignments ───────────────────────────────────────────────────────────────
export interface AssignmentInput {
  scopeType: PolicyScopeType;
  scopeId?: string | null;
}

export async function findAssignments(
  client: TenantClient,
  policyId: string
): Promise<PolicyAssignment[]> {
  const { rows } = await client.query(
    `SELECT id, policy_id, scope_type, scope_id
       FROM rb2_policy_assignments
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
    `DELETE FROM rb2_policy_assignments WHERE tenant_id = $1 AND policy_id = $2`,
    [client.tenantId, policyId]
  );
  for (const a of assignments) {
    await client.query(
      `INSERT INTO rb2_policy_assignments (tenant_id, policy_id, scope_type, scope_id)
       VALUES ($1, $2, $3, $4)`,
      [client.tenantId, policyId, a.scopeType, a.scopeType === 'org' ? null : a.scopeId ?? null]
    );
  }
}

// ── Lines ─────────────────────────────────────────────────────────────────────
export interface LineInput {
  categoryId: string;
  maxPerClaim?: number | null;
  monthlyLimit?: number | null;
  yearlyLimit?: number | null;
  perDayLimit?: number | null;
}

export async function findLines(
  client: TenantClient,
  policyId: string
): Promise<PolicyLine[]> {
  const { rows } = await client.query(
    `SELECT id, policy_id, category_id, max_per_claim, monthly_limit, yearly_limit, per_day_limit
       FROM rb2_policy_lines
      WHERE tenant_id = $1 AND policy_id = $2
      ORDER BY created_at ASC`,
    [client.tenantId, policyId]
  );
  return rows.map((r) => ({
    id: r.id,
    policyId: r.policy_id,
    categoryId: r.category_id,
    maxPerClaim: num(r.max_per_claim),
    monthlyLimit: num(r.monthly_limit),
    yearlyLimit: num(r.yearly_limit),
    perDayLimit: num(r.per_day_limit),
  }));
}

// ── Policy resolution (which policy applies to a user) ──────────────────────
// A user's org scopes come from users.position_id → positions (which carries
// grade_id / department_id / sub_department_id). Most-specific assignment wins:
// user > position > subdepartment > department > grade > org.
export interface ApplicablePolicy {
  id: string;
  autoApproveBelow: number | null;
}

export async function findApplicablePolicy(
  client: TenantClient,
  userId: string
): Promise<ApplicablePolicy | null> {
  const { rows } = await client.query(
    `WITH s AS (
       SELECT u.position_id, p.grade_id, p.department_id, p.sub_department_id
         FROM users u
         LEFT JOIN positions p ON p.id = u.position_id AND p.tenant_id = u.tenant_id
        WHERE u.id = $2::text
        LIMIT 1
     )
     SELECT pol.id, pol.auto_approve_below,
            CASE a.scope_type
              WHEN 'user' THEN 6 WHEN 'position' THEN 5 WHEN 'subdepartment' THEN 4
              WHEN 'department' THEN 3 WHEN 'grade' THEN 2 WHEN 'org' THEN 1 ELSE 0
            END AS rank
       FROM rb2_policies pol
       JOIN rb2_policy_assignments a ON a.policy_id = pol.id AND a.tenant_id = pol.tenant_id
       CROSS JOIN s
      WHERE pol.tenant_id = $1 AND pol.deleted_at IS NULL AND pol.is_active = true
        AND (
          -- org entity ids (positions/grades/departments) are TEXT in the Prisma
          -- schema; compare scope_id as text so uuid↔text doesn't error.
          (a.scope_type = 'user' AND a.scope_id::text = $2)
          OR (a.scope_type = 'position' AND a.scope_id::text = s.position_id)
          OR (a.scope_type = 'subdepartment' AND a.scope_id::text = s.sub_department_id)
          OR (a.scope_type = 'department' AND a.scope_id::text = s.department_id)
          OR (a.scope_type = 'grade' AND a.scope_id::text = s.grade_id)
          OR (a.scope_type = 'org')
        )
      ORDER BY rank DESC, pol.created_at DESC
      LIMIT 1`,
    [client.tenantId, userId]
  );
  return rows[0]
    ? { id: rows[0].id, autoApproveBelow: rows[0].auto_approve_below == null ? null : Number(rows[0].auto_approve_below) }
    : null;
}

export interface LineLimits {
  maxPerClaim: number | null;
  monthlyLimit: number | null;
  yearlyLimit: number | null;
  perDayLimit: number | null;
}

/** The category's limit override from a policy, if a line exists for it. */
export async function findLineForCategory(
  client: TenantClient,
  policyId: string,
  categoryId: string
): Promise<LineLimits | null> {
  const { rows } = await client.query(
    `SELECT max_per_claim, monthly_limit, yearly_limit, per_day_limit
       FROM rb2_policy_lines
      WHERE tenant_id = $1 AND policy_id = $2 AND category_id = $3
      LIMIT 1`,
    [client.tenantId, policyId, categoryId]
  );
  return rows[0]
    ? {
        maxPerClaim: num(rows[0].max_per_claim),
        monthlyLimit: num(rows[0].monthly_limit),
        yearlyLimit: num(rows[0].yearly_limit),
        perDayLimit: num(rows[0].per_day_limit),
      }
    : null;
}

/** Delete all lines for a policy, then insert the provided set. */
export async function replaceLines(
  client: TenantClient,
  policyId: string,
  lines: LineInput[]
): Promise<void> {
  await client.query(
    `DELETE FROM rb2_policy_lines WHERE tenant_id = $1 AND policy_id = $2`,
    [client.tenantId, policyId]
  );
  for (const l of lines) {
    await client.query(
      `INSERT INTO rb2_policy_lines
         (tenant_id, policy_id, category_id, max_per_claim, monthly_limit, yearly_limit, per_day_limit)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        client.tenantId,
        policyId,
        l.categoryId,
        l.maxPerClaim ?? null,
        l.monthlyLimit ?? null,
        l.yearlyLimit ?? null,
        l.perDayLimit ?? null,
      ]
    );
  }
}
