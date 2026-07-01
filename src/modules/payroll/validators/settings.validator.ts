// src/modules/payroll/validators/settings.validator.ts
// Zod schema for the General Settings payload. The controller parses the request
// body through this so the service receives already-validated, typed data.

import { z } from 'zod';

export const updateSettingsSchema = z.object({
  financialYearStartMonth: z.number().int().min(1).max(12).default(4),
  currency: z.string().trim().min(1).max(8).default('INR'),
  payFrequency: z
    .enum(['monthly', 'semi_monthly', 'weekly', 'biweekly'])
    .default('monthly'),

  salaryCalcBasis: z.enum(['calendar_days', 'fixed_days', 'working_days']).default('calendar_days'),
  salaryFixedDays: z.number().int().min(1).max(31).default(30),

  lopCalcBasis: z.enum(['calendar_days', 'fixed_days', 'working_days']).default('calendar_days'),
  lopFixedDays: z.number().int().min(1).max(31).default(30),

  roundingMode: z.enum(['none', 'nearest', 'up', 'down']).default('nearest'),
  roundingNearest: z.number().positive().max(1000).default(1),
  decimalPlaces: z.number().int().min(0).max(4).default(2),

  payDay: z.number().int().min(1).max(31).default(1),
  enableLop: z.boolean().default(true),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
