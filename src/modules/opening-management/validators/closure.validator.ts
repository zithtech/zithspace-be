// src/modules/opening-management/validators/closure.validator.ts
// Zod schemas for the Phase 7 closing and archiving endpoints.

import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const closureReasonEnum = z.enum([
  'position_filled',
  'cancelled',
  'budget_issue',
  'client_cancelled',
  'duplicate_opening',
]);

export const closeOpeningSchema = z
  .object({
    closureReason: closureReasonEnum,
    note: optionalText(1000),
    /** Required for `duplicate_opening` — the opening this one duplicates. */
    duplicateOfOpeningId: z.string().trim().uuid('duplicateOfOpeningId must be a uuid').optional().nullable(),
    /** The spec's "automatically archive". Opt out for a staged clean-up. */
    archive: z.boolean().default(true),
    /**
     * Bulk-reject everyone left in the pipeline. Off by default: rejecting
     * candidates is a real decision with real consequences, not a side effect
     * someone should get without asking for it.
     */
    rejectRemaining: z.boolean().default(false),
  })
  .refine((d) => d.closureReason !== 'duplicate_opening' || !!d.duplicateOfOpeningId, {
    message: 'duplicateOfOpeningId is required when closing as a duplicate opening',
    path: ['duplicateOfOpeningId'],
  })
  .refine((d) => d.closureReason === 'duplicate_opening' || !d.duplicateOfOpeningId, {
    message: 'duplicateOfOpeningId is only valid when the reason is duplicate_opening',
    path: ['duplicateOfOpeningId'],
  });

export const archiveSchema = z.object({
  note: optionalText(500),
});

export type CloseOpeningInput = z.infer<typeof closeOpeningSchema>;
export type ArchiveInput = z.infer<typeof archiveSchema>;
