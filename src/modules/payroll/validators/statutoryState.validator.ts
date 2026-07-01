// src/modules/payroll/validators/statutoryState.validator.ts
// Zod schemas for Professional Tax (state + slabs) and LWF (per state).

import { z } from 'zod';

const slabSchema = z
  .object({
    fromAmount: z.number().min(0).max(100_000_000).default(0),
    toAmount: z.number().min(0).max(100_000_000).optional().nullable(),
    monthlyAmount: z.number().min(0).max(10_000_000).default(0),
    displayOrder: z.number().int().min(0).max(9999).default(0),
  })
  .refine((s) => s.toAmount == null || s.toAmount >= s.fromAmount, {
    message: 'to amount must be ≥ from amount',
    path: ['toAmount'],
  });

export const createPtStateSchema = z.object({
  state: z.string().trim().min(1, 'state is required').max(80),
  isActive: z.boolean().default(true),
  slabs: z.array(slabSchema).min(1, 'Add at least one slab'),
});

export const updatePtStateSchema = createPtStateSchema;

export const createLwfStateSchema = z.object({
  state: z.string().trim().min(1, 'state is required').max(80),
  employeeAmount: z.number().min(0).max(10_000_000).default(0),
  employerAmount: z.number().min(0).max(10_000_000).default(0),
  frequency: z.enum(['monthly', 'half_yearly', 'yearly']).default('half_yearly'),
  isActive: z.boolean().default(true),
});

export const updateLwfStateSchema = createLwfStateSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field must be provided' });

export type CreatePtStateInput = z.infer<typeof createPtStateSchema>;
export type UpdatePtStateInput = z.infer<typeof updatePtStateSchema>;
export type CreateLwfStateInput = z.infer<typeof createLwfStateSchema>;
export type UpdateLwfStateInput = z.infer<typeof updateLwfStateSchema>;
