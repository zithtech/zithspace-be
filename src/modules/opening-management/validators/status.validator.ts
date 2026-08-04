// src/modules/opening-management/validators/status.validator.ts
// Zod schemas for the Phase 3 status endpoints.

import { z } from 'zod';
import { openingStatusEnum } from './opening.validator';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const changeStatusSchema = z.object({
  status: openingStatusEnum,
  /** Short machine-ish tag stored alongside the status; defaults to the status. */
  reason: optionalText(80),
  /** Free text. Mandatory for the transitions the state machine marks as such. */
  note: optionalText(1000),
});

export const holdSchema = z.object({
  note: z.string().trim().min(1, 'A note is required when putting an opening on hold').max(1000),
});

export const resumeSchema = z.object({
  note: optionalText(1000),
});

export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
export type HoldInput = z.infer<typeof holdSchema>;
export type ResumeInput = z.infer<typeof resumeSchema>;
