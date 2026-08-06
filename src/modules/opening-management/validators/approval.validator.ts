// src/modules/opening-management/validators/approval.validator.ts
// Zod schemas for the Phase 2 approval workflow — both the tenant-level config
// (workflows + steps) and the per-opening decisions.

import { z } from 'zod';

export const approverTypeEnum = z.enum([
  'hiring_manager',
  'department_head',
  'role',
  'specific_user',
]);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

// ─── Workflow config ────────────────────────────────────────────────────────

/**
 * A step's approver reference must match its type — the same rule the
 * `ck_om_workflow_steps_approver_ref` constraint enforces in the database.
 */
export const workflowStepSchema = z
  .object({
    stepName: z.string().trim().min(1, 'stepName is required').max(120),
    approverType: approverTypeEnum,
    roleId: z.string().trim().uuid('roleId must be a uuid').optional().nullable(),
    specificUserId: z.string().trim().max(64).optional().nullable(),
    fallbackUserId: z.string().trim().max(64).optional().nullable(),
    isOptional: z.boolean().default(false),
    slaHours: z.number().int().min(1).max(8760).optional().nullable(),
  })
  .refine((s) => s.approverType !== 'role' || !!s.roleId, {
    message: "A 'role' step requires roleId",
    path: ['roleId'],
  })
  .refine((s) => s.approverType !== 'specific_user' || !!s.specificUserId, {
    message: "A 'specific_user' step requires specificUserId",
    path: ['specificUserId'],
  });

const workflowShape = {
  name: z.string().trim().min(1, 'name is required').max(150),
  description: optionalText(500),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  /** Ordered: position in the array IS the step order. */
  steps: z.array(workflowStepSchema).min(1, 'A workflow needs at least one step').max(20),
};

export const createWorkflowSchema = z.object(workflowShape);

// Steps are all-or-nothing on update: omit `steps` to leave the chain as it is,
// send it to replace the whole chain.
export const updateWorkflowSchema = z
  .object({ ...workflowShape, steps: workflowShape.steps.optional() })
  .partial()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  });

// ─── Decisions ──────────────────────────────────────────────────────────────

export const decisionSchema = z.object({
  note: optionalText(1000),
});

/** Rejection must say why — it sends the opening back to the creator. */
export const rejectionSchema = z.object({
  note: z.string().trim().min(1, 'A rejection note is required').max(1000),
});

export const submitSchema = z.object({
  /** Override the tenant default workflow for this submission. */
  workflowId: z.string().trim().uuid('workflowId must be a uuid').optional().nullable(),
  note: optionalText(1000),
});

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
export type WorkflowStepInput = z.infer<typeof workflowStepSchema>;
export type DecisionInput = z.infer<typeof decisionSchema>;
export type SubmitInput = z.infer<typeof submitSchema>;
