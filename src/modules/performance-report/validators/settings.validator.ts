// src/modules/performance-report/validators/settings.validator.ts
// Zod schema for the Settings page payload. The controller parses the request
// body through this so the service receives already-validated, typed data.

import { z } from 'zod';
import { MODULE_KEYS } from '../types';

const moduleSettingSchema = z.object({
  moduleKey: z.enum(MODULE_KEYS),
  isEnabled: z.boolean().default(true),
  // numeric(5,2) in DB; keep it a clean 0–100 with at most 2 decimals.
  weight: z
    .number()
    .min(0, 'weight cannot be negative')
    .max(100, 'weight cannot exceed 100'),
  config: z.record(z.string(), z.unknown()).default({}),
});

// HH:mm, 24-hour.
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const updateSettingsSchema = z
  .object({
    autoGenerateEnabled: z.boolean().default(true),
    generationDay: z.literal('last_day').default('last_day'),
    generationTime: z
      .string()
      .regex(timeRegex, 'generationTime must be HH:mm (24-hour)')
      .default('23:59'),
    modules: z
      .array(moduleSettingSchema)
      .min(1, 'at least one module is required'),
  })
  // No duplicate module keys.
  .refine(
    (data) => new Set(data.modules.map((m) => m.moduleKey)).size === data.modules.length,
    { message: 'duplicate module keys are not allowed', path: ['modules'] }
  )
  // Weighted scoring requires the enabled modules to sum to exactly 100.
  .refine(
    (data) => {
      const enabled = data.modules.filter((m) => m.isEnabled);
      if (enabled.length === 0) return true; // nothing enabled → no weight constraint
      const sum = enabled.reduce((acc, m) => acc + m.weight, 0);
      return Math.abs(sum - 100) < 0.01;
    },
    {
      message: 'weights of enabled modules must sum to 100',
      path: ['modules'],
    }
  );

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type ModuleSettingInput = z.infer<typeof moduleSettingSchema>;
