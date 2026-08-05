// src/modules/opening-management/validators/posting.validator.ts
// Zod schemas for the Phase 4 posting endpoints.

import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const updatePostingSettingsSchema = z
  .object({
    /** Length of the internal-only window. The spec's default is 15 days. */
    internalPostingDays: z.number().int().min(1).max(365).optional(),
    autoMoveToExternal: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one setting must be provided',
  });

export const postInternalSchema = z.object({
  /** Overrides the tenant's configured window for this posting only. */
  days: z.number().int().min(1).max(365).optional(),
  /** Overrides the tenant's auto-move setting for this posting only. */
  autoMove: z.boolean().optional(),
  note: optionalText(1000),
});

export const postExternalSchema = z.object({
  note: optionalText(1000),
});

export const closePostingSchema = z.object({
  reason: optionalText(500),
});

export type UpdatePostingSettingsInput = z.infer<typeof updatePostingSettingsSchema>;
export type PostInternalInput = z.infer<typeof postInternalSchema>;
export type PostExternalInput = z.infer<typeof postExternalSchema>;
export type ClosePostingInput = z.infer<typeof closePostingSchema>;
