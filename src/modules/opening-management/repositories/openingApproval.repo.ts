// src/modules/opening-management/repositories/openingApproval.repo.ts
//
// Raw-SQL data access for om_opening_approvals — the RUNTIME side of Phase 2.
//
// Rows here are a snapshot taken at submission time: approver ids are already
// resolved and frozen, so nothing in this file re-reads the workflow config.
// Sequencing is by `step_order` within a `round`; only the lowest-numbered
// pending step of the opening's current round is actionable.

import { TenantClient } from '../db/pool';
import { ApprovalStatus, ApproverType, OpeningApproval, PendingApprovalItem } from '../types';

function mapApproval(r: any): OpeningApproval {
  return {
    id: r.id,
    openingId: r.opening_id,
    round: r.round,
    stepOrder: r.step_order,
    stepName: r.step_name,
    approverType: r.approver_type,
    roleId: r.role_id,
    roleName: r.role_name ?? null,
    approverId: r.approver_id,
    approverName: r.approver_name ?? null,
    fallbackUserId: r.fallback_user_id,
    fallbackUserName: r.fallback_user_name ?? null,
    isOptional: r.is_optional,
    status: r.status,
    decidedBy: r.decided_by,
    decidedByName: r.decided_by_name ?? null,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
    decidedAsAdmin: r.decided_as_admin,
    slaHours: r.sla_hours,
    createdAt: r.created_at,
  };
}

const APPROVAL_SELECT = `
  SELECT a.id, a.opening_id, a.round, a.step_order, a.step_name, a.approver_type,
         a.role_id, r.name AS role_name,
         a.approver_id, ua.name AS approver_name,
         a.fallback_user_id, uf.name AS fallback_user_name,
         a.is_optional, a.status,
         a.decided_by, ud.name AS decided_by_name,
         a.decided_at, a.decision_note, a.decided_as_admin,
         a.sla_hours, a.created_at
    FROM om_opening_approvals a
    LEFT JOIN roles r  ON r.id  = a.role_id
    LEFT JOIN users ua ON ua.id = a.approver_id
    LEFT JOIN users uf ON uf.id = a.fallback_user_id
    LEFT JOIN users ud ON ud.id = a.decided_by
`;

// ─── Materialising a round ──────────────────────────────────────────────────

export interface MaterializedStep {
  stepOrder: number;
  stepName: string;
  approverType: ApproverType;
  roleId: string | null;
  approverId: string | null;
  fallbackUserId: string | null;
  isOptional: boolean;
  slaHours: number | null;
  workflowId: string | null;
  workflowStepId: string | null;
}

/** Write a whole round of pending steps in one statement. */
export async function insertRound(
  client: TenantClient,
  openingId: string,
  round: number,
  steps: MaterializedStep[]
): Promise<void> {
  if (steps.length === 0) return;

  await client.query(
    `INSERT INTO om_opening_approvals
       (tenant_id, opening_id, round, step_order, step_name, approver_type,
        role_id, approver_id, fallback_user_id, is_optional, sla_hours,
        workflow_id, workflow_step_id)
     SELECT $1, $2, $3, x.step_order, x.step_name, x.approver_type,
            x.role_id::uuid, x.approver_id, x.fallback_user_id, x.is_optional, x.sla_hours,
            x.workflow_id::uuid, x.workflow_step_id::uuid
       FROM UNNEST(
              $4::int[], $5::text[], $6::text[], $7::text[], $8::text[],
              $9::text[], $10::boolean[], $11::int[], $12::text[], $13::text[]
            ) AS x(step_order, step_name, approver_type, role_id, approver_id,
                   fallback_user_id, is_optional, sla_hours, workflow_id, workflow_step_id)`,
    [
      client.tenantId,
      openingId,
      round,
      steps.map((s) => s.stepOrder),
      steps.map((s) => s.stepName),
      steps.map((s) => s.approverType),
      steps.map((s) => s.roleId),
      steps.map((s) => s.approverId),
      steps.map((s) => s.fallbackUserId),
      steps.map((s) => s.isOptional),
      steps.map((s) => s.slaHours),
      steps.map((s) => s.workflowId),
      steps.map((s) => s.workflowStepId),
    ]
  );
}

// ─── Reads ──────────────────────────────────────────────────────────────────

/** Every round of an opening, oldest step first. */
export async function findByOpening(
  client: TenantClient,
  openingId: string
): Promise<OpeningApproval[]> {
  const { rows } = await client.query(
    `${APPROVAL_SELECT}
      WHERE a.tenant_id = $1 AND a.opening_id = $2
      ORDER BY a.round ASC, a.step_order ASC`,
    [client.tenantId, openingId]
  );
  return rows.map(mapApproval);
}

/**
 * The one step that can be decided right now: the lowest pending step_order in
 * the given round. Returns null when the round has no pending steps left.
 */
export async function findCurrentStep(
  client: TenantClient,
  openingId: string,
  round: number
): Promise<OpeningApproval | null> {
  const { rows } = await client.query(
    `${APPROVAL_SELECT}
      WHERE a.tenant_id = $1 AND a.opening_id = $2 AND a.round = $3 AND a.status = 'pending'
      ORDER BY a.step_order ASC
      LIMIT 1`,
    [client.tenantId, openingId, round]
  );
  return rows[0] ? mapApproval(rows[0]) : null;
}

export async function countPendingInRound(
  client: TenantClient,
  openingId: string,
  round: number
): Promise<number> {
  const { rows } = await client.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM om_opening_approvals
      WHERE tenant_id = $1 AND opening_id = $2 AND round = $3 AND status = 'pending'`,
    [client.tenantId, openingId, round]
  );
  return Number(rows[0].total);
}

/** Is this user a current holder of the role? Expired assignments do not count. */
export async function isRoleMember(
  client: TenantClient,
  userId: string,
  roleId: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM user_roles
      WHERE tenant_id = $1 AND user_id = $2 AND role_id = $3
        AND (expires_at IS NULL OR expires_at > now())
      LIMIT 1`,
    [client.tenantId, userId, roleId]
  );
  return (rowCount ?? 0) > 0;
}

// ─── Decisions ──────────────────────────────────────────────────────────────

export interface DecisionData {
  status: Extract<ApprovalStatus, 'approved' | 'rejected' | 'skipped'>;
  decidedBy: string;
  note: string | null;
  decidedAsAdmin: boolean;
}

/**
 * Record a decision. The `status = 'pending'` guard makes this a compare-and-set:
 * two approvers racing on the same step means the second one affects no rows and
 * gets a clean "no longer pending" error rather than overwriting the first.
 */
export async function decide(
  client: TenantClient,
  approvalId: string,
  data: DecisionData
): Promise<OpeningApproval | null> {
  const { rows } = await client.query(
    `UPDATE om_opening_approvals
        SET status = $3, decided_by = $4, decided_at = now(),
            decision_note = $5, decided_as_admin = $6
      WHERE tenant_id = $1 AND id = $2 AND status = 'pending'
      RETURNING id`,
    [client.tenantId, approvalId, data.status, data.decidedBy, data.note, data.decidedAsAdmin]
  );
  if (!rows[0]) return null;

  const { rows: full } = await client.query(
    `${APPROVAL_SELECT} WHERE a.tenant_id = $1 AND a.id = $2`,
    [client.tenantId, approvalId]
  );
  return full[0] ? mapApproval(full[0]) : null;
}

/**
 * Close out the rest of a round — used when a rejection ends it, or the
 * submitter withdraws. Returns how many steps were closed.
 */
export async function closeRemaining(
  client: TenantClient,
  openingId: string,
  round: number,
  status: Extract<ApprovalStatus, 'skipped' | 'cancelled'>,
  decidedBy: string,
  note: string | null
): Promise<number> {
  const { rowCount } = await client.query(
    `UPDATE om_opening_approvals
        SET status = $4, decided_by = $5, decided_at = now(), decision_note = $6
      WHERE tenant_id = $1 AND opening_id = $2 AND round = $3 AND status = 'pending'`,
    [client.tenantId, openingId, round, status, decidedBy, note]
  );
  return rowCount ?? 0;
}

// ─── Pending queue ──────────────────────────────────────────────────────────

const PENDING_QUEUE_SELECT = `
  SELECT o.id AS opening_id, o.opening_code, o.job_title, o.priority,
         o.number_of_positions, o.submitted_at,
         us.name AS submitted_by_name,
         d.name  AS department_name,
         COALESCE(rc.client_name, cv.company_name) AS client_name,
         a.id, a.opening_id AS approval_opening_id, a.round, a.step_order, a.step_name,
         a.approver_type, a.role_id, r.name AS role_name,
         a.approver_id, ua.name AS approver_name,
         a.fallback_user_id, uf.name AS fallback_user_name,
         a.is_optional, a.status, a.decided_by, NULL::text AS decided_by_name,
         a.decided_at, a.decision_note, a.decided_as_admin, a.sla_hours, a.created_at
    FROM om_opening_approvals a
    JOIN om_openings o ON o.id = a.opening_id
                      AND o.deleted_at IS NULL
                      AND o.status = 'pending_approval'
                      AND o.approval_round = a.round
    LEFT JOIN roles r  ON r.id  = a.role_id
    LEFT JOIN users ua ON ua.id = a.approver_id
    LEFT JOIN users uf ON uf.id = a.fallback_user_id
    LEFT JOIN users us ON us.id = o.submitted_by::text
    LEFT JOIN departments d ON d.id = o.department_id
    LEFT JOIN recruitment_client_basic_information rc ON rc.id = o.client_id
    LEFT JOIN clients_v2 cv ON cv.id = o.client_id
`;

// Only the lowest pending step of a round is actionable — everything behind it
// is still waiting its turn and must not show up in anyone's queue.
const IS_CURRENT_STEP = `
  a.status = 'pending'
  AND a.step_order = (
    SELECT MIN(a2.step_order) FROM om_opening_approvals a2
     WHERE a2.opening_id = a.opening_id AND a2.round = a.round AND a2.status = 'pending'
  )
`;

function mapPendingItem(r: any): PendingApprovalItem {
  return {
    openingId: r.opening_id,
    openingCode: r.opening_code,
    jobTitle: r.job_title,
    departmentName: r.department_name,
    clientName: r.client_name,
    priority: r.priority,
    numberOfPositions: r.number_of_positions,
    submittedAt: r.submitted_at,
    submittedByName: r.submitted_by_name,
    approval: mapApproval({ ...r, opening_id: r.approval_opening_id }),
  };
}

/**
 * Openings waiting on `userId`: the current step names them directly, names them
 * as fallback, or requires a role they currently hold.
 */
export async function listPendingForUser(
  client: TenantClient,
  userId: string
): Promise<PendingApprovalItem[]> {
  const { rows } = await client.query(
    `${PENDING_QUEUE_SELECT}
      WHERE a.tenant_id = $1
        AND ${IS_CURRENT_STEP}
        AND (
          a.approver_id = $2
          OR a.fallback_user_id = $2
          OR (a.approver_type = 'role' AND EXISTS (
                -- user_roles.tenant_id is text while om_* tenant_id is uuid, so
                -- compare column-to-column: reusing $1 here would force the
                -- parameter to be uuid and blow up with "text = uuid".
                SELECT 1 FROM user_roles ur
                 WHERE ur.tenant_id = a.tenant_id::text
                   AND ur.user_id = $2 AND ur.role_id = a.role_id
                   AND (ur.expires_at IS NULL OR ur.expires_at > now())
              ))
        )
      ORDER BY o.submitted_at ASC NULLS LAST`,
    [client.tenantId, userId]
  );
  return rows.map(mapPendingItem);
}

/** Every opening currently awaiting a decision — the HR/admin view. */
export async function listAllPending(client: TenantClient): Promise<PendingApprovalItem[]> {
  const { rows } = await client.query(
    `${PENDING_QUEUE_SELECT}
      WHERE a.tenant_id = $1 AND ${IS_CURRENT_STEP}
      ORDER BY o.submitted_at ASC NULLS LAST`,
    [client.tenantId]
  );
  return rows.map(mapPendingItem);
}
