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
