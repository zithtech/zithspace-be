// src/modules/payroll/validators/workflow.validator.ts
// Zod schemas for Salary Approval Workflow input (header + ordered steps).

import { z } from 'zod';

const stepSchema = z
  .object({
    approverType: z.enum(['manager', 'role', 'specific_user']),
    roleId: z.string().uuid().optional().nullable(),
    specificUserId: z.string().uuid().optional().nullable(),
    fallbackUserId: z.string().uuid().optional().nullable(),
  })
  .superRefine((s, ctx) => {
    if (s.approverType === 'role' && !s.roleId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'roleId is required for a role step', path: ['roleId'] });
    }
    if (s.approverType === 'specific_user' && !s.specificUserId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'specificUserId is required for a specific-user step', path: ['specificUserId'] });
    }
  });

export const createWorkflowSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(120),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  steps: z.array(stepSchema).min(1, 'Add at least one approval step'),
});

export const updateWorkflowSchema = createWorkflowSchema;

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
