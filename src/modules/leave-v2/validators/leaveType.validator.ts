// src/modules/leave-v2/validators/leaveType.validator.ts
// Zod schemas for Leave Type input. The controller parses request bodies through
// these so services receive already-validated, typed data.

import { z } from 'zod';

export const createLeaveTypeSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(120),
  code: z
    .string()
    .trim()
    .min(1, 'code is required')
    .max(40)
    .regex(/^[a-zA-Z0-9_-]+$/, 'code may only contain letters, numbers, hyphen and underscore'),
  unit: z.enum(['day', 'hour']).default('day'),
  isPaid: z.boolean().default(true),
  requiresApproval: z.boolean().default(true),
  color: z.string().trim().max(20).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});

// All fields optional on update; at least one must be present.
export const updateLeaveTypeSchema = createLeaveTypeSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>;
export type UpdateLeaveTypeInput = z.infer<typeof updateLeaveTypeSchema>;
