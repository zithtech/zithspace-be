// src/modules/payroll/validators/assignment.validator.ts
// Zod schema for assigning a salary structure to an employee.

import { z } from 'zod';

export const assignSchema = z.object({
  employeeId: z.string().uuid('a valid employee is required'),
  structureId: z.string().uuid('a valid structure is required'),
  monthlyCtc: z.number().min(0).max(1_000_000_000),
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveFrom must be YYYY-MM-DD')
    .optional(),
  notes: z.string().trim().max(500).optional().nullable(),
});

// Preview a breakdown for an employee CTC against a structure (no persistence).
export const previewAssignSchema = z.object({
  structureId: z.string().uuid(),
  monthlyCtc: z.number().min(0).max(1_000_000_000),
});

export type AssignInput = z.infer<typeof assignSchema>;
export type PreviewAssignInput = z.infer<typeof previewAssignSchema>;
