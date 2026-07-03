// src/modules/reimbursement-v2/validators/policy.validator.ts
// Zod schemas for Reimbursement Policy input (header + assignments + lines).

import { z } from 'zod';

const money = z.number().nonnegative().max(99999999.99).optional().nullable();

const assignmentSchema = z
  .object({
    scopeType: z.enum([
      'grade',
      'department',
      'subdepartment',
      'position',
      'location',
      'user',
      'org',
    ]),
    scopeId: z.string().uuid().optional().nullable(),
  })
  .superRefine((v, ctx) => {
    // Every scope except 'org' must name a concrete target.
    if (v.scopeType !== 'org' && !v.scopeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `scopeId is required for scopeType "${v.scopeType}"`,
        path: ['scopeId'],
      });
    }
  });

const lineSchema = z.object({
  categoryId: z.string().uuid(),
  maxPerClaim: money,
  monthlyLimit: money,
  yearlyLimit: money,
  perDayLimit: money,
});

export const createPolicySchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(120),
  code: z
    .string()
    .trim()
    .min(1, 'code is required')
    .max(40)
    .regex(/^[a-zA-Z0-9_-]+$/, 'code may only contain letters, numbers, hyphen and underscore'),
  description: z.string().trim().max(500).optional().nullable(),
  autoApproveBelow: money,
  isActive: z.boolean().default(true),
  assignments: z.array(assignmentSchema).default([]),
  lines: z.array(lineSchema).default([]),
});

// Update mirrors create (full replace of assignments + lines).
export const updatePolicySchema = createPolicySchema;

export type CreatePolicyInput = z.infer<typeof createPolicySchema>;
export type UpdatePolicyInput = z.infer<typeof updatePolicySchema>;
