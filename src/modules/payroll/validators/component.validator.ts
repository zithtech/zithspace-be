// src/modules/payroll/validators/component.validator.ts
// Zod schemas for Salary Component input. The controller parses request bodies
// through these so services receive already-validated, typed data.

import { z } from 'zod';

export const createComponentSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required').max(120),
    code: z
      .string()
      .trim()
      .min(1, 'code is required')
      .max(40)
      .regex(/^[a-zA-Z0-9_-]+$/, 'code may only contain letters, numbers, hyphen and underscore'),
    category: z.enum(['earning', 'deduction', 'reimbursement', 'benefit']).default('earning'),
    calculationType: z.enum(['fixed', 'percentage', 'formula']).default('fixed'),
    percentageOf: z.enum(['gross', 'basic', 'ctc']).optional().nullable(),
    defaultValue: z.number().min(0).max(1_000_000_000).optional().nullable(),
    isTaxable: z.boolean().default(true),
    isProRata: z.boolean().default(true),
    partOfCtc: z.boolean().default(true),
    considerForPf: z.boolean().default(false),
    considerForEsi: z.boolean().default(false),
    showOnPayslip: z.boolean().default(true),
    displayOrder: z.number().int().min(0).max(9999).default(0),
    description: z.string().trim().max(500).optional().nullable(),
    isActive: z.boolean().default(true),
  })
  // A percentage component must declare what it is a percentage of.
  .refine((d) => d.calculationType !== 'percentage' || !!d.percentageOf, {
    message: 'percentageOf is required when calculationType is "percentage"',
    path: ['percentageOf'],
  });

// All fields optional on update; at least one must be present.
export const updateComponentSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    code: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[a-zA-Z0-9_-]+$/, 'code may only contain letters, numbers, hyphen and underscore'),
    category: z.enum(['earning', 'deduction', 'reimbursement', 'benefit']),
    calculationType: z.enum(['fixed', 'percentage', 'formula']),
    percentageOf: z.enum(['gross', 'basic', 'ctc']).optional().nullable(),
    defaultValue: z.number().min(0).max(1_000_000_000).optional().nullable(),
    isTaxable: z.boolean(),
    isProRata: z.boolean(),
    partOfCtc: z.boolean(),
    considerForPf: z.boolean(),
    considerForEsi: z.boolean(),
    showOnPayslip: z.boolean(),
    displayOrder: z.number().int().min(0).max(9999),
    description: z.string().trim().max(500).optional().nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type CreateComponentInput = z.infer<typeof createComponentSchema>;
export type UpdateComponentInput = z.infer<typeof updateComponentSchema>;
