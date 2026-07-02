// src/modules/leave-v2/validators/leaveRequest.validator.ts
import { z } from 'zod';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

export const applyLeaveSchema = z
  .object({
    leaveTypeId: z.string().uuid(),
    fromDate: dateStr,
    toDate: dateStr,
    dayPortion: z.enum(['full', 'first_half', 'second_half']).default('full'),
    reason: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.toDate < v.fromDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'toDate must be on or after fromDate', path: ['toDate'] });
    }
    if (v.dayPortion !== 'full' && v.fromDate !== v.toDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Half-day applies to a single day only', path: ['dayPortion'] });
    }
  });

export type ApplyLeaveInput = z.infer<typeof applyLeaveSchema>;

// Employee asks to release unused days of an approved leave: either the whole
// thing (releaseAll) or shorten it to end on newToDate (the tail is released).
export const withdrawRequestSchema = z
  .object({
    releaseAll: z.boolean().optional(),
    newToDate: dateStr.optional().nullable(),
    reason: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (!v.releaseAll && !v.newToDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide newToDate to shorten the leave, or set releaseAll to release it entirely',
        path: ['newToDate'],
      });
    }
  });

export type WithdrawRequestInput = z.infer<typeof withdrawRequestSchema>;

// Manager's decision on a pending withdrawal request.
export const withdrawDecisionSchema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(500).optional().nullable(),
});

export type WithdrawDecisionInput = z.infer<typeof withdrawDecisionSchema>;
