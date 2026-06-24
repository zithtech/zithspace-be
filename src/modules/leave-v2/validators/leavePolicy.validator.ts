// src/modules/leave-v2/validators/leavePolicy.validator.ts
// Zod schemas for Leave Policy input (header + assignments + lines).

import { z } from 'zod';

const scopeTypes = ['grade', 'department', 'subdepartment', 'position', 'user', 'org'] as const;

const assignmentSchema = z
  .object({
    scopeType: z.enum(scopeTypes),
    scopeId: z.string().uuid().optional().nullable(),
  })
  .superRefine((val, ctx) => {
    // Every scope except 'org' must carry a target id.
    if (val.scopeType !== 'org' && !val.scopeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `scopeId is required for scope "${val.scopeType}"`,
        path: ['scopeId'],
      });
    }
  });

const lineSchema = z.object({
  leaveTypeId: z.string().uuid(),
  accrualMethod: z.enum(['monthly', 'term_total']).default('term_total'),
  countPerPeriod: z.number().min(0).max(9999),
  carryForward: z.boolean().default(false),
  carryForwardMax: z.number().min(0).max(9999).optional().nullable(),
});

export const createLeavePolicySchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(160),
  code: z
    .string()
    .trim()
    .min(1, 'code is required')
    .max(40)
    .regex(/^[a-zA-Z0-9_-]+$/, 'code may only contain letters, numbers, hyphen and underscore'),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
  termCycle: z.enum(['monthly', 'quarterly', 'half_yearly', 'yearly']).default('yearly'),
  lopOnExhaustion: z.boolean().default(true),
  assignments: z.array(assignmentSchema).min(1, 'Add at least one target'),
  lines: z.array(lineSchema).min(1, 'Add at least one leave allocation'),
});

export const updateLeavePolicySchema = createLeavePolicySchema;

export type CreateLeavePolicyInput = z.infer<typeof createLeavePolicySchema>;
export type UpdateLeavePolicyInput = z.infer<typeof updateLeavePolicySchema>;
