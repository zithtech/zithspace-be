// src/modules/reimbursement-v2/validators/category.validator.ts
// Zod schemas for Expense Category input. Controllers parse request bodies
// through these so services receive already-validated, typed data.

import { z } from 'zod';

const money = z.number().nonnegative().max(99999999.99).optional().nullable();

const categoryFields = z.object({
  name: z.string().trim().min(1, 'name is required').max(120).regex(/^[a-zA-Z0-9\s\-_.,()]*$/, 'Special characters are not allowed'),
  code: z
    .string()
    .trim()
    .min(1, 'code is required')
    .max(40)
    .regex(/^[a-zA-Z0-9_-]+$/, 'code may only contain letters, numbers, hyphen and underscore'),
  description: z.string().trim().max(500).regex(/^[a-zA-Z0-9\s\-_.,()]*$/, 'Special characters are not allowed').optional().nullable(),
  glCode: z.string().trim().max(60).optional().nullable(),
  kind: z.enum(['amount', 'mileage']).default('amount'),
  mileageRate: z.number().positive().max(99999999.99).optional().nullable(),
  mileageUnit: z.string().trim().max(10).optional().nullable(),
  maxPerClaim: money,
  monthlyLimit: money,
  yearlyLimit: money,
  perDayLimit: money,
  receiptRequired: z.boolean().default(false),
  receiptRequiredAbove: money,
  isActive: z.boolean().default(true),
});

// Mileage categories must define a per-unit rate.
export const createCategorySchema = categoryFields.superRefine((v, ctx) => {
  if (v.kind === 'mileage' && (v.mileageRate == null || v.mileageRate <= 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'mileageRate is required (and > 0) for mileage categories',
      path: ['mileageRate'],
    });
  }
});

// All fields optional on update; at least one must be present.
export const updateCategorySchema = categoryFields
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
