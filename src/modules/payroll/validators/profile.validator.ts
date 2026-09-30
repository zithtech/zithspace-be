// src/modules/payroll/validators/profile.validator.ts
// Zod schema for an employee's statutory & bank profile.

import { z } from 'zod';

const optStr = (max: number) => z.string().trim().max(max).optional().nullable();

export const upsertProfileSchema = z.object({
  pan: optStr(10).refine((v) => !v || /^[A-Za-z0-9]*$/.test(v), 'Special characters are not allowed'),
  uan: optStr(20).refine((v) => !v || /^[A-Za-z0-9]*$/.test(v), 'Special characters are not allowed'),
  pfNumber: optStr(30).refine((v) => !v || /^[A-Za-z0-9\-_./\s]*$/.test(v), 'Special characters are not allowed'),
  esiNumber: optStr(30).refine((v) => !v || /^[A-Za-z0-9\-_./\s]*$/.test(v), 'Special characters are not allowed'),
  taxRegime: z.enum(['old', 'new']).default('new'),
  accountHolderName: optStr(120).refine((v) => !v || /^[a-zA-Z0-9\s\-_.,()&/'"]*$/.test(v), 'Special characters are not allowed'),
  bankName: optStr(160).refine((v) => !v || /^[a-zA-Z0-9\s\-_.,()&/'"]*$/.test(v), 'Special characters are not allowed'),
  bankAccountNumber: optStr(40).refine((v) => !v || /^[A-Za-z0-9\-]*$/.test(v), 'Special characters are not allowed'),
  bankIfsc: optStr(20).refine((v) => !v || /^[A-Za-z0-9]*$/.test(v), 'Special characters are not allowed'),
});

export type UpsertProfileInput = z.infer<typeof upsertProfileSchema>;
