// src/modules/payroll/validators/schedule.validator.ts
// Zod schemas for Pay Schedule and Pay Group input.

import { z } from 'zod';

const codeRule = z
  .string()
  .trim()
  .min(1, 'code is required')
  .max(40)
  .regex(/^[a-zA-Z0-9_-]+$/, 'code may only contain letters, numbers, hyphen and underscore');

export const createScheduleSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(120),
  code: codeRule,
  frequency: z.enum(['monthly', 'semi_monthly', 'weekly', 'biweekly']).default('monthly'),
  cycleStartDay: z.number().int().min(1).max(31).default(1),
  cycleEndDay: z.number().int().min(1).max(31).default(31),
  payDay: z.number().int().min(1).max(31).default(1),
  payInNextMonth: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateScheduleSchema = createScheduleSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field must be provided' });

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(120),
  code: codeRule,
  scheduleId: z.string().uuid('a pay schedule is required'),
  legalEntity: z.string().trim().max(160).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateGroupSchema = createGroupSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field must be provided' });

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
