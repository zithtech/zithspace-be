// src/modules/payroll/validators/statutory.validator.ts
// Zod schemas for PF and ESI statutory config.

import { z } from 'zod';

const pct = z.number().min(0).max(100);

export const updatePfSchema = z.object({
  enabled: z.boolean().default(true),
  employeeRate: pct.default(12),
  employerRate: pct.default(12),
  wageCeiling: z.number().min(0).max(10_000_000).default(15000),
  restrictToCeiling: z.boolean().default(true),
  includeEmployerInCtc: z.boolean().default(true),
  epsEnabled: z.boolean().default(true),
  epsRate: pct.default(8.33),
  edliEnabled: z.boolean().default(true),
  edliRate: pct.default(0.5),
  adminChargesRate: pct.default(0.5),
  establishmentCode: z.string().trim().max(40).optional().nullable(),
});

export const updateEsiSchema = z.object({
  enabled: z.boolean().default(true),
  employeeRate: pct.default(0.75),
  employerRate: pct.default(3.25),
  wageThreshold: z.number().min(0).max(10_000_000).default(21000),
  establishmentCode: z.string().trim().max(40).optional().nullable(),
});

export type UpdatePfInput = z.infer<typeof updatePfSchema>;
export type UpdateEsiInput = z.infer<typeof updateEsiSchema>;
