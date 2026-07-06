// src/modules/reimbursement-v2/validators/claim.validator.ts
// Zod schemas for claim + line-item input.

import { z } from 'zod';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

export const itemSchema = z.object({
  categoryId: z.string().uuid(),
  expenseDate: dateStr,
  merchant: z.string().trim().max(160).optional().nullable(),
  billNo: z.string().trim().max(100).optional().nullable(),
  // Optional here: for 'mileage' categories the amount is derived from distance ×
  // rate; for 'amount' categories the service requires it. Enforced in service.
  amount: z.number().positive('amount must be greater than 0').max(99999999.99).optional().nullable(),
  distance: z.number().positive('distance must be greater than 0').max(9999999.99).optional().nullable(),
  taxAmount: z.number().nonnegative().max(99999999.99).default(0),
  description: z.string().trim().max(500).optional().nullable(),
});

export const createClaimSchema = z.object({
  title: z.string().trim().max(160).optional().nullable(),
  currency: z.string().trim().length(3, 'currency must be a 3-letter code').toUpperCase().default('INR'),
  exchangeRate: z.number().positive().max(9999999.999999).default(1),
  baseCurrency: z.string().trim().length(3).toUpperCase().default('INR'),
  advanceId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  items: z.array(itemSchema).default([]),
});

export const updateClaimSchema = z
  .object({
    title: z.string().trim().max(160).optional().nullable(),
    currency: z.string().trim().length(3).toUpperCase().optional(),
    exchangeRate: z.number().positive().max(9999999.999999).optional(),
    baseCurrency: z.string().trim().length(3).toUpperCase().optional(),
    advanceId: z.string().uuid().optional().nullable(),
    projectId: z.string().uuid().optional().nullable(),
    departmentId: z.string().uuid().optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field must be provided' });

export const addItemSchema = itemSchema;
export const updateItemSchema = itemSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field must be provided' });

export const attachmentMetaSchema = z.object({
  claimItemId: z.string().uuid().optional().nullable(),
});

export const decisionSchema = z.object({
  remarks: z.string().trim().max(500).optional().nullable(),
});

export const markPaidSchema = z.object({
  paymentReference: z.string().trim().min(1, 'paymentReference is required').max(120),
  remarks: z.string().trim().max(500).optional().nullable(),
});

export type CreateClaimInput = z.infer<typeof createClaimSchema>;
export type UpdateClaimInput = z.infer<typeof updateClaimSchema>;
export type ItemInput = z.infer<typeof itemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
