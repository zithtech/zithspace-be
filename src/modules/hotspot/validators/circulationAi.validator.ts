// src/modules/hotspot/validators/circulationAi.validator.ts
// Zod schemas for the Circulation AI writing assist.

import { z } from 'zod';

/** Slug shape only — categories are per-tenant, so there is no fixed enum. */
const categorySlug = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9_]+$/);

export const toneEnum = z.enum(['neutral', 'friendly', 'formal', 'urgent', 'celebratory']);

export const TONES = toneEnum.options;

export const composeSchema = z.object({
  /** What the update is about, in the poster's own words. */
  brief: z.string().trim().min(3, 'Say what the update is about').max(2_000),
  category: categorySlug.default('general'),
  /**
   * Display label for a tenant-defined category. The slug alone ("town_hall")
   * is a poor prompt; the label is what the model can actually reason about.
   */
  categoryLabel: z.string().trim().max(40).optional().nullable(),
  tone: toneEnum.default('neutral'),
  /** Title already typed — the model refines it instead of inventing a new one. */
  currentTitle: z.string().trim().max(250).optional().nullable(),
  /** Existing draft body (HTML). Present when rewriting rather than starting fresh. */
  currentBody: z.string().max(50_000).optional().nullable(),
});

export const grammarSchema = z.object({
  // Bounded so a paste of a whole handbook cannot become a huge prompt.
  html: z.string().trim().min(1, 'There is nothing to correct').max(50_000),
});

export type ComposeInput = z.infer<typeof composeSchema>;
export type GrammarInput = z.infer<typeof grammarSchema>;
