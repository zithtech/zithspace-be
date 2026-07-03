// src/modules/reimbursement-v2/validators/advance.validator.ts
// Zod schemas for cash-advance input.

import { z } from 'zod';

export const createAdvanceSchema = z.object({
  purpose: z.string().trim().max(500).optional().nullable(),
  amount: z.number().positive('amount must be greater than 0').max(99999999.99),
  currency: z.string().trim().length(3, 'currency must be a 3-letter code').toUpperCase().default('INR'),
  neededBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'neededBy must be YYYY-MM-DD').optional().nullable(),
});

export type CreateAdvanceInput = z.infer<typeof createAdvanceSchema>;
