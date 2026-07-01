// src/modules/payroll/validators/profile.validator.ts
// Zod schema for an employee's statutory & bank profile.

import { z } from 'zod';

const optStr = (max: number) => z.string().trim().max(max).optional().nullable();

export const upsertProfileSchema = z.object({
  pan: optStr(10),
  uan: optStr(20),
  pfNumber: optStr(30),
  esiNumber: optStr(30),
  taxRegime: z.enum(['old', 'new']).default('new'),
  accountHolderName: optStr(120),
  bankName: optStr(160),
  bankAccountNumber: optStr(40),
  bankIfsc: optStr(20),
});

export type UpsertProfileInput = z.infer<typeof upsertProfileSchema>;
