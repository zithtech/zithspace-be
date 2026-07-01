// src/modules/payroll/validators/structure.validator.ts
// Zod schemas for Salary Structure input (header + component lines).

import { z } from 'zod';

const lineSchema = z
  .object({
    componentId: z.string().uuid(),
    calculationType: z.enum(['fixed', 'percentage']).default('fixed'),
    percentageOf: z.enum(['gross', 'basic', 'ctc']).optional().nullable(),
    value: z.number().min(0).max(1_000_000_000).default(0),
    displayOrder: z.number().int().min(0).max(9999).default(0),
  })
  .refine((l) => l.calculationType !== 'percentage' || !!l.percentageOf, {
    message: 'percentageOf is required for a percentage line',
    path: ['percentageOf'],
  });

export const createStructureSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(160),
  code: z
    .string()
    .trim()
    .min(1, 'code is required')
    .max(40)
    .regex(/^[a-zA-Z0-9_-]+$/, 'code may only contain letters, numbers, hyphen and underscore'),
  description: z.string().trim().max(500).optional().nullable(),
  monthlyCtc: z.number().min(0).max(1_000_000_000).default(0),
  isActive: z.boolean().default(true),
  lines: z.array(lineSchema).min(1, 'Add at least one component'),
});

export const updateStructureSchema = createStructureSchema;

// Standalone preview: compute a breakdown for unsaved edits.
export const previewStructureSchema = z.object({
  monthlyCtc: z.number().min(0).max(1_000_000_000).default(0),
  lines: z
    .array(
      z.object({
        componentId: z.string().uuid(),
        calculationType: z.enum(['fixed', 'percentage']).default('fixed'),
        percentageOf: z.enum(['gross', 'basic', 'ctc']).optional().nullable(),
        value: z.number().min(0).max(1_000_000_000).default(0),
        displayOrder: z.number().int().min(0).max(9999).default(0),
      })
    )
    .default([]),
});

export type CreateStructureInput = z.infer<typeof createStructureSchema>;
export type UpdateStructureInput = z.infer<typeof updateStructureSchema>;
export type PreviewStructureInput = z.infer<typeof previewStructureSchema>;
