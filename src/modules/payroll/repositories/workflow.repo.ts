// src/modules/payroll/repositories/workflow.repo.ts
//
// Raw-SQL data access for approval workflows (header + ordered steps).
// Every query takes a tenant-scoped client AND filters tenant_id explicitly.

import { TenantClient } from '../db/pool';
import { ApprovalStep, ApprovalWorkflow, ApprovalWorkflowListItem, ApproverType } from '../types';

const WF_COLS = `id, tenant_id, name, description, is_active, is_default, created_by, updated_by, created_at, updated_at`;

function mapWf(r: any): ApprovalWorkflow {
  return {
    id: r.id, tenantId: r.tenant_id, name: r.name, description: r.description,
    isActive: r.is_active, isDefault: r.is_default,
    createdBy: r.created_by, updatedBy: r.updated_by, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export interface WorkflowHeaderData {
  name: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
}

export async function insertWorkflow(client: TenantClient, d: WorkflowHeaderData, actorId: string): Promise<ApprovalWorkflow> {
  const { rows } = await client.query(
    `INSERT INTO pay_approval_workflows (tenant_id, name, description, is_active, is_default, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING ${WF_COLS}`,
    [client.tenantId, d.name, d.description, d.isActive, d.isDefault, actorId]
  );
  return mapWf(rows[0]);
}

export async function updateWorkflowHeader(client: TenantClient, id: string, d: WorkflowHeaderData, actorId: string): Promise<ApprovalWorkflow | null> {
  const { rows } = await client.query(
    `UPDATE pay_approval_workflows
        SET name = $3, description = $4, is_active = $5, is_default = $6, updated_by = $7, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING ${WF_COLS}`,
    [client.tenantId, id, d.name, d.description, d.isActive, d.isDefault, actorId]
  );
  return rows[0] ? mapWf(rows[0]) : null;
}

export async function findWorkflowById(client: TenantClient, id: string): Promise<ApprovalWorkflow | null> {
  const { rows } = await client.query(
    `SELECT ${WF_COLS} FROM pay_approval_workflows WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return rows[0] ? mapWf(rows[0]) : null;
}

export async function listWorkflows(
  client: TenantClient,
  opts: { includeInactive?: boolean; page?: number; limit?: number; search?: string } = {}
): Promise<{ data: ApprovalWorkflowListItem[]; total: number }> {
  const conditions = ['w.tenant_id = $1', 'w.deleted_at IS NULL'];
  const params: any[] = [client.tenantId];

  if (!opts.includeInactive) {
    conditions.push('w.is_active = true');
  }

  if (opts.search) {
    params.push(`%${opts.search}%`);
    conditions.push(`w.name ILIKE $${params.length}`);
  }

  const countResult = await client.query(
    `SELECT COUNT(*) AS total FROM pay_approval_workflows w WHERE ${conditions.join(' AND ')}`,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const page = opts.page ?? 1;
  const limit = opts.limit ?? 20;
  const offset = (page - 1) * limit;

  params.push(limit, offset);

  const { rows } = await client.query(
    `SELECT ${WF_COLS.split(',').map((c) => 'w.' + c.trim()).join(', ')},
            (SELECT count(*) FROM pay_approval_steps s WHERE s.workflow_id = w.id) AS step_count
       FROM pay_approval_workflows w
      WHERE ${conditions.join(' AND ')}
      ORDER BY w.is_default DESC, w.name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return {
    data: rows.map((r) => ({ ...mapWf(r), stepCount: Number(r.step_count) })),
    total,
  };
}

// The tenant's default active workflow + its step count (for run submission).
export async function findDefaultWorkflow(client: TenantClient): Promise<{ id: string; name: string; stepCount: number } | null> {
  const { rows } = await client.query(
    `SELECT w.id, w.name, (SELECT count(*) FROM pay_approval_steps s WHERE s.workflow_id = w.id) AS step_count
       FROM pay_approval_workflows w
      WHERE w.tenant_id = $1 AND w.is_default = true AND w.is_active = true AND w.deleted_at IS NULL
      LIMIT 1`,
    [client.tenantId]
  );
  return rows[0] ? { id: rows[0].id, name: rows[0].name, stepCount: Number(rows[0].step_count) } : null;
}

export async function clearDefault(client: TenantClient, exceptId?: string): Promise<void> {
  const params: any[] = [client.tenantId];
  let sql = `UPDATE pay_approval_workflows SET is_default = false, updated_at = now()
              WHERE tenant_id = $1 AND is_default = true AND deleted_at IS NULL`;
  if (exceptId) { params.push(exceptId); sql += ` AND id <> $2`; }
  await client.query(sql, params);
}

export async function softDeleteWorkflow(client: TenantClient, id: string, actorId: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE pay_approval_workflows SET deleted_at = now(), is_default = false, updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, actorId]
  );
  return (rowCount ?? 0) > 0;
}

// ── Steps ─────────────────────────────────────────────────────────────────────
export interface StepInput {
  stepOrder: number;
  approverType: ApproverType;
  roleId: string | null;
  specificUserId: string | null;
  fallbackUserId: string | null;
}

export async function findSteps(client: TenantClient, workflowId: string): Promise<ApprovalStep[]> {
  const { rows } = await client.query(
    `SELECT id, workflow_id, step_order, approver_type, role_id, specific_user_id, fallback_user_id
       FROM pay_approval_steps WHERE tenant_id = $1 AND workflow_id = $2 ORDER BY step_order ASC`,
    [client.tenantId, workflowId]
  );
  return rows.map((r) => ({
    id: r.id, workflowId: r.workflow_id, stepOrder: r.step_order, approverType: r.approver_type,
    roleId: r.role_id, specificUserId: r.specific_user_id, fallbackUserId: r.fallback_user_id,
  }));
}

export async function replaceSteps(client: TenantClient, workflowId: string, steps: StepInput[]): Promise<void> {
  await client.query(`DELETE FROM pay_approval_steps WHERE tenant_id = $1 AND workflow_id = $2`, [client.tenantId, workflowId]);
  for (const s of steps) {
    await client.query(
      `INSERT INTO pay_approval_steps
         (tenant_id, workflow_id, step_order, approver_type, role_id, specific_user_id, fallback_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        client.tenantId, workflowId, s.stepOrder, s.approverType,
        s.approverType === 'role' ? s.roleId : null,
        s.approverType === 'specific_user' ? s.specificUserId : null,
        s.fallbackUserId,
      ]
    );
  }
}
