// src/modules/leave-v2/validators/holiday.validator.ts
import { z } from 'zod';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

export const holidaySchema = z
  .object({
    name: z.string().trim().min(1, 'name is required').max(160),
    country: z.string().trim().min(1).max(8).default('IN'),
    states: z.array(z.string().trim().min(1).max(8)).default([]),
    districts: z.array(z.string().trim().min(1).max(80)).default([]),
    fromDate: dateStr,
    toDate: dateStr,
    type: z.enum(['National', 'State', 'Local', 'ALL', 'Restricted']).default('National'),
    rule: z.enum(['Fixed', 'Variable']).default('Fixed'),
    isActive: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.toDate < v.fromDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'toDate must be on or after fromDate', path: ['toDate'] });
    }
    if ((v.type === 'State' || v.type === 'Local') && v.states.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pick at least one state', path: ['states'] });
    }
    if (v.type === 'Local' && v.districts.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Add at least one district for a Local holiday', path: ['districts'] });
    }
  });

export type HolidayInput = z.infer<typeof holidaySchema>;
