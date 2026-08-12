// src/modules/opening-management/services/approval.service.ts
//
// The Phase 2 approval engine:
//
//   draft ──submit──▶ pending_approval ──all steps approved──▶ approved
//                            │
//                            ├── reject   ──▶ draft (round closed, note required)
//                            └── withdraw ──▶ draft (round cancelled)
//
// Sequencing: within a round, only the lowest-numbered pending step is
// actionable. Approver identities are resolved ONCE, at submission, and frozen
// on the opening — a later edit to the workflow template, or to the opening's
// hiring manager, cannot change who is being asked to decide.
//
// Every transition is a guarded compare-and-set at the SQL level, so two people
// acting at the same moment produce one winner and one clean 409.

import { TenantClient, withTenant } from '../db/pool';
import * as openingRepo from '../repositories/opening.repo';
import * as approvalRepo from '../repositories/openingApproval.repo';
import * as workflowRepo from '../repositories/approvalWorkflow.repo';
import * as statusRepo from '../repositories/openingStatus.repo';
import {
  Actor,
  ApprovalWorkflowStep,
  Opening,
  OpeningApproval,
  OpeningApprovalRound,
  OpeningApprovalState,
  OpeningError,
  PendingApprovalItem,
} from '../types';
import { SubmitInput } from '../validators/approval.validator';

/**
 * Used when a tenant has configured no workflow at all. One step, the hiring
 * manager — the minimum that still makes "approved" mean something. Configure a
 * workflow to get the full Hiring Manager → HR → Finance chain.
 */
const IMPLICIT_STEP: Omit<ApprovalWorkflowStep, 'id' | 'workflowId'> = {
  stepOrder: 1,
  stepName: 'Hiring Manager Approval',
  approverType: 'hiring_manager',
  roleId: null,
  roleName: null,
  specificUserId: null,
  specificUserName: null,
  fallbackUserId: null,
  fallbackUserName: null,
  isOptional: false,
  slaHours: null,
};

// ─── Approver resolution ────────────────────────────────────────────────────

/**
 * Turn a template step into a concrete assignment for this opening.
 *
 * A step that cannot name anybody is a hard error at SUBMIT time rather than a
 * silent dead end discovered later by whoever is waiting on it.
 */
async function resolveApprover(
  client: TenantClient,
  step: Pick<
    ApprovalWorkflowStep,
    'stepName' | 'approverType' | 'roleId' | 'specificUserId' | 'fallbackUserId'
  >,
  opening: Opening
): Promise<{ approverId: string | null; roleId: string | null }> {
  switch (step.approverType) {
    case 'hiring_manager': {
      let approverId = opening.hiringManagerId;
      if (!approverId) {
        const { rows } = await client.query<{ member_id: string }>(
          `SELECT member_id FROM om_opening_hiring_team 
            WHERE opening_id = $1 AND member_type = 'hiring_manager' AND member_id IS NOT NULL 
            LIMIT 1`,
          [opening.id]
        );
        approverId = rows[0]?.member_id ?? null;
      }
      approverId = approverId ?? step.fallbackUserId ?? null;

      if (!approverId) {
        throw OpeningError.badRequest(
          `Step "${step.stepName}" needs a hiring manager — assign one on the opening, or give the step a fallback approver`
        );
      }
      return { approverId, roleId: null };
    }

    case 'department_head': {
      let headId: string | null = null;
      if (opening.departmentId) {
        const { rows } = await client.query<{ head_id: string | null }>(
          `SELECT head_id FROM departments WHERE id = $1 AND tenant_id = $2`,
          [opening.departmentId, client.tenantId]
        );
        headId = rows[0]?.head_id ?? null;
      }
      const approverId = headId ?? step.fallbackUserId ?? null;
      if (!approverId) {
        throw OpeningError.badRequest(
          `Step "${step.stepName}" needs a department head — the opening's department has none, and the step has no fallback approver`
        );
      }
      return { approverId, roleId: null };
    }

    case 'specific_user':
      return { approverId: step.specificUserId, roleId: null };

    case 'role': {
      // Nobody holding the role means nobody can act; only accept that if a
      // fallback approver exists to take the step.
      const { rowCount } = await client.query(
        `SELECT 1 FROM user_roles
          WHERE tenant_id = $1 AND role_id = $2
            AND (expires_at IS NULL OR expires_at > now())
          LIMIT 1`,
        [client.tenantId, step.roleId]
      );
      if ((rowCount ?? 0) === 0 && !step.fallbackUserId) {
        throw OpeningError.badRequest(
          `Step "${step.stepName}" is assigned to a role that no active user currently holds, and the step has no fallback approver`
        );
      }
      return { approverId: null, roleId: step.roleId };
    }

    default:
      throw OpeningError.badRequest(`Unsupported approver type on step "${step.stepName}"`);
  }
}

// ─── Assembly ───────────────────────────────────────────────────────────────

/** Group the flat approval rows into rounds, newest first. */
function groupRounds(approvals: OpeningApproval[]): OpeningApprovalRound[] {
  const byRound = new Map<number, OpeningApproval[]>();
  for (const a of approvals) {
    const list = byRound.get(a.round) ?? [];
    list.push(a);
    byRound.set(a.round, list);
  }
  return [...byRound.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([round, steps]) => ({ round, steps }));
}

async function loadState(client: TenantClient, opening: Opening): Promise<OpeningApprovalState> {
  const approvals = await approvalRepo.findByOpening(client, opening.id);
  const currentStep =
    opening.status === 'pending_approval'
      ? await approvalRepo.findCurrentStep(client, opening.id, opening.approvalRound)
      : null;
  return { opening, currentStep, rounds: groupRounds(approvals) };
}

async function requireOpening(client: TenantClient, id: string): Promise<Opening> {
  const opening = await openingRepo.findById(client, id);
  if (!opening) throw OpeningError.notFound('Opening');
  return opening;
}

/**
 * Approval moves belong on the Phase 3 status timeline too — an opening should
 * have ONE history, not one story in approvals and another in status.
 */
async function recordStatusMove(
  client: TenantClient,
  openingId: string,
  from: Opening['status'],
  to: Opening['status'],
  reason: string,
  note: string | null,
  actor: Actor
): Promise<void> {
  await statusRepo.appendHistory(client, {
    openingId,
    fromStatus: from,
    toStatus: to,
    reason,
    note,
    changedBy: actor.userId,
  });
}

// ─── Submit ─────────────────────────────────────────────────────────────────

export async function submitForApproval(
  actor: Actor,
  openingId: string,
  input: SubmitInput
): Promise<OpeningApprovalState> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await requireOpening(client, openingId);
    if (opening.status !== 'draft') {
      throw OpeningError.conflict(
        `Only a draft opening can be submitted for approval (this one is "${opening.status}")`
      );
    }

    // Named workflow wins; otherwise the tenant default; otherwise implicit.
    let workflowId: string | null = null;
    let steps: Pick<
      ApprovalWorkflowStep,
      | 'id'
      | 'stepOrder'
      | 'stepName'
      | 'approverType'
      | 'roleId'
      | 'specificUserId'
      | 'fallbackUserId'
      | 'isOptional'
      | 'slaHours'
    >[];

    if (input.workflowId) {
      const wf = await workflowRepo.findWorkflowById(client, input.workflowId);
      if (!wf) throw OpeningError.notFound('Approval workflow');
      if (!wf.isActive) throw OpeningError.badRequest('That approval workflow is inactive');
      workflowId = wf.id;
      steps = await workflowRepo.findSteps(client, wf.id);
    } else {
      const wf = await workflowRepo.findDefaultWorkflow(client);
      if (wf) {
        workflowId = wf.id;
        steps = await workflowRepo.findSteps(client, wf.id);
      } else {
        steps = [{ ...IMPLICIT_STEP, id: null as any }];
      }
    }

    if (steps.length === 0) {
      throw OpeningError.badRequest('That approval workflow has no steps configured');
    }

    // Resolve every approver BEFORE writing anything: a chain that cannot be
    // completed should never reach 'pending_approval'.
    const materialized: approvalRepo.MaterializedStep[] = [];
    for (const step of steps) {
      const { approverId, roleId } = await resolveApprover(client, step, opening);
      materialized.push({
        stepOrder: step.stepOrder,
        stepName: step.stepName,
        approverType: step.approverType,
        roleId,
        approverId,
        fallbackUserId: step.fallbackUserId ?? null,
        isOptional: step.isOptional ?? false,
        slaHours: step.slaHours ?? null,
        workflowId,
        workflowStepId: step.id ?? null,
      });
    }

    const round = opening.approvalRound + 1;
    const submitted = await openingRepo.markSubmitted(client, openingId, round, actor.userId);
    if (!submitted) {
      throw OpeningError.conflict('The opening is no longer a draft — it may have just been submitted');
    }

    await approvalRepo.insertRound(client, openingId, round, materialized);
    await recordStatusMove(
      client,
      openingId,
      'draft',
      'pending_approval',
      'submitted_for_approval',
      input.note ?? null,
      actor
    );
    return loadState(client, submitted);
  });
}

// ─── Decisions ──────────────────────────────────────────────────────────────

interface DecisionContext {
  /** The caller holds `opening.manage` — may act on any step (recorded as such). */
  canManageAll: boolean;
}

/** Who is allowed to decide the step that is currently waiting. */
async function assertCanDecide(
  client: TenantClient,
  step: OpeningApproval,
  actor: Actor,
  ctx: DecisionContext
): Promise<{ asAdmin: boolean }> {
  const isNamedApprover =
    step.approverId === actor.userId || step.fallbackUserId === actor.userId;

  const holdsRole =
    !isNamedApprover &&
    step.approverType === 'role' &&
    !!step.roleId &&
    (await approvalRepo.isRoleMember(client, actor.userId, step.roleId));

  if (isNamedApprover || holdsRole) return { asAdmin: false };

  if (ctx.canManageAll) return { asAdmin: true };

  throw OpeningError.forbidden(`You are not an approver for step "${step.stepName}"`);
}

/** The step the caller is about to act on, with the opening's state validated. */
async function loadActionableStep(
  client: TenantClient,
  openingId: string
): Promise<{ opening: Opening; step: OpeningApproval }> {
  const opening = await requireOpening(client, openingId);
  if (opening.status !== 'pending_approval') {
    throw OpeningError.conflict(
      `This opening is not awaiting approval (status "${opening.status}")`
    );
  }
  const step = await approvalRepo.findCurrentStep(client, openingId, opening.approvalRound);
  if (!step) {
    throw OpeningError.conflict('There is no pending approval step on this opening');
  }
  return { opening, step };
}

/** Approve, then finish the round if that was the last step. */
export async function approve(
  actor: Actor,
  openingId: string,
  note: string | null,
  ctx: DecisionContext
): Promise<OpeningApprovalState> {
  return withTenant(actor.tenantId, async (client) => {
    const { opening, step } = await loadActionableStep(client, openingId);
    const { asAdmin } = await assertCanDecide(client, step, actor, ctx);

    const decided = await approvalRepo.decide(client, step.id, {
      status: 'approved',
      decidedBy: actor.userId,
      note,
      decidedAsAdmin: asAdmin,
    });
    if (!decided) {
      throw OpeningError.conflict('That approval step was just decided by someone else');
    }

    return finishRoundIfComplete(client, opening, actor);
  });
}

/**
 * Skip an OPTIONAL step (Finance approval is the canonical case). Gated on
 * `opening.manage` at the route, and refused for a mandatory step.
 */
export async function skip(
  actor: Actor,
  openingId: string,
  note: string | null,
  ctx: DecisionContext
): Promise<OpeningApprovalState> {
  return withTenant(actor.tenantId, async (client) => {
    const { opening, step } = await loadActionableStep(client, openingId);
    if (!step.isOptional) {
      throw OpeningError.badRequest(`Step "${step.stepName}" is mandatory and cannot be skipped`);
    }
    await assertCanDecide(client, step, actor, ctx);

    const decided = await approvalRepo.decide(client, step.id, {
      status: 'skipped',
      decidedBy: actor.userId,
      note,
      decidedAsAdmin: true,
    });
    if (!decided) {
      throw OpeningError.conflict('That approval step was just decided by someone else');
    }

    return finishRoundIfComplete(client, opening, actor);
  });
}

/** No steps left pending → the opening is approved. */
async function finishRoundIfComplete(
  client: TenantClient,
  opening: Opening,
  actor: Actor
): Promise<OpeningApprovalState> {
  const remaining = await approvalRepo.countPendingInRound(
    client,
    opening.id,
    opening.approvalRound
  );
  if (remaining > 0) {
    return loadState(client, await requireOpening(client, opening.id));
  }

  const approved = await openingRepo.markApproved(client, opening.id, actor.userId);
  if (!approved) {
    throw OpeningError.conflict('The opening changed state while the decision was being recorded');
  }
  await recordStatusMove(
    client,
    opening.id,
    'pending_approval',
    'approved',
    'approval_completed',
    null,
    actor
  );
  return loadState(client, approved);
}

/**
 * Reject: ends the round and sends the opening back to draft. Steps that had not
 * been reached are closed as 'skipped' so the round reads as finished rather
 * than abandoned.
 */
export async function reject(
  actor: Actor,
  openingId: string,
  note: string,
  ctx: DecisionContext
): Promise<OpeningApprovalState> {
  return withTenant(actor.tenantId, async (client) => {
    const { opening, step } = await loadActionableStep(client, openingId);
    const { asAdmin } = await assertCanDecide(client, step, actor, ctx);

    const decided = await approvalRepo.decide(client, step.id, {
      status: 'rejected',
      decidedBy: actor.userId,
      note,
      decidedAsAdmin: asAdmin,
    });
    if (!decided) {
      throw OpeningError.conflict('That approval step was just decided by someone else');
    }

    await approvalRepo.closeRemaining(
      client,
      opening.id,
      opening.approvalRound,
      'skipped',
      actor.userId,
      `Round closed — rejected at step "${step.stepName}"`
    );

    const returned = await openingRepo.markReturnedToDraft(client, opening.id, actor.userId);
    if (!returned) {
      throw OpeningError.conflict('The opening changed state while the decision was being recorded');
    }
    await recordStatusMove(
      client,
      opening.id,
      'pending_approval',
      'draft',
      'approval_rejected',
      note,
      actor
    );
    return loadState(client, returned);
  });
}

/**
 * Withdraw a submission — the requester recalling it, or an admin pulling it
 * back. Remaining steps are cancelled (not rejected: nobody decided against it).
 */
export async function withdraw(
  actor: Actor,
  openingId: string,
  note: string | null,
  ctx: DecisionContext
): Promise<OpeningApprovalState> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await requireOpening(client, openingId);
    if (opening.status !== 'pending_approval') {
      throw OpeningError.conflict(
        `This opening is not awaiting approval (status "${opening.status}")`
      );
    }

    const isOwner = opening.submittedBy === actor.userId || opening.createdBy === actor.userId;
    if (!isOwner && !ctx.canManageAll) {
      throw OpeningError.forbidden('Only the submitter can withdraw this opening from approval');
    }

    await approvalRepo.closeRemaining(
      client,
      opening.id,
      opening.approvalRound,
      'cancelled',
      actor.userId,
      note ?? 'Withdrawn by the submitter'
    );

    const returned = await openingRepo.markReturnedToDraft(client, opening.id, actor.userId);
    if (!returned) {
      throw OpeningError.conflict('The opening changed state while the withdrawal was being recorded');
    }
    await recordStatusMove(
      client,
      opening.id,
      'pending_approval',
      'draft',
      'approval_withdrawn',
      note,
      actor
    );
    return loadState(client, returned);
  });
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function getApprovalState(
  actor: Actor,
  openingId: string
): Promise<OpeningApprovalState> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await requireOpening(client, openingId);
    return loadState(client, opening);
  });
}

/** The caller's approval queue — or every pending approval for HR/admins. */
export async function listPendingApprovals(
  actor: Actor,
  viewAll: boolean
): Promise<PendingApprovalItem[]> {
  return withTenant(actor.tenantId, (client) =>
    viewAll ? approvalRepo.listAllPending(client) : approvalRepo.listPendingForUser(client, actor.userId)
  );
}
