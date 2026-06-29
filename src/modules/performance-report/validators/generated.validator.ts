// src/modules/performance-report/validators/generated.validator.ts
import { z } from 'zod';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');
const score = z.number().min(0).max(100).nullable();

export const saveGeneratedSchema = z.object({
  userId: z.string().trim().min(1),
  periodKey: z.string().regex(/^\d{4}-\d{2}$/, 'periodKey must be YYYY-MM'),
  periodStart: dateOnly,
  periodEnd: dateOnly,
  scores: z.object({
    overall: score.optional().default(null),
    tickets: score.optional().default(null),
    timeTracking: score.optional().default(null),
    dailyUpdates: score.optional().default(null),
    attendance: score.optional().default(null),
    leaves: score.optional().default(null),
  }),
  summary: z.record(z.string(), z.unknown()).default({}),
  // PDF as a base64 data URL.
  pdfBase64: z.string().min(1).refine((v) => v.startsWith('data:'), 'pdfBase64 must be a data URL'),
});

export type SaveGeneratedInput = z.infer<typeof saveGeneratedSchema>;

export const listGeneratedQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});
export type ListGeneratedQuery = z.infer<typeof listGeneratedQuerySchema>;
