// src/modules/reimbursement-v2/validators/budget.validator.ts
// Zod schemas for budget input.

import { z } from 'zod';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

export const createBudgetSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required').max(120),
    scopeType: z.enum(['org', 'department', 'project', 'category', 'user']),
    scopeId: z.string().uuid().optional().nullable(),
    periodStart: dateStr,
    periodEnd: dateStr,
    amount: z.number().positive('amount must be greater than 0').max(99999999999.99),
    currency: z.string().trim().length(3).toUpperCase().default('INR'),
    isActive: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.scopeType !== 'org' && !v.scopeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `scopeId is required for scopeType "${v.scopeType}"`,
        path: ['scopeId'],
      });
    }
    if (v.periodEnd < v.periodStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'periodEnd must be on or after periodStart',
        path: ['periodEnd'],
      });
    }
  });

export const updateBudgetSchema = createBudgetSchema;

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
