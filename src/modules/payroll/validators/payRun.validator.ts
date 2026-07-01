// src/modules/payroll/validators/payRun.validator.ts
// Zod schemas for pay-run create and per-item LOP edit.

import { z } from 'zod';

export const createRunSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const updateItemSchema = z.object({
  lopDays: z.number().min(0).max(31),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const processStepSchema = z.object({
  action: z.enum(['approve', 'reject']),
  remarks: z.string().trim().max(500).optional().nullable(),
});

export type CreateRunInput = z.infer<typeof createRunSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ProcessStepInput = z.infer<typeof processStepSchema>;
