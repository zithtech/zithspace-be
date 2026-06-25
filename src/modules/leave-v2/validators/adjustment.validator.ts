// src/modules/leave-v2/validators/adjustment.validator.ts
import { z } from 'zod';

export const createAdjustmentSchema = z.object({
  employeeId: z.string().uuid(),
  leaveTypeId: z.string().uuid(),
  kind: z.enum(['credit', 'debit', 'comp_off', 'opening', 'encashment']),
  amount: z.number().positive().max(9999),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reason: z.string().trim().max(500).optional().nullable(),
});

export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;
