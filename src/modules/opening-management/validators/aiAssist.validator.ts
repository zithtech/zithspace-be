// src/modules/opening-management/validators/aiAssist.validator.ts
// Zod schemas for the AI writing-assist endpoints.

import { z } from 'zod';
import { employmentTypeEnum, workModeEnum } from './opening.validator';

export const assistFieldEnum = z.enum(['job_description', 'responsibilities']);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** What the form knows about the opening, used to ground the generation. */
export const assistContextSchema = z.object({
  jobTitle: z.string().trim().min(1, 'A job title is required').max(200),
  departmentName: optionalText(150),
  employmentType: employmentTypeEnum.optional().nullable(),
  workMode: workModeEnum.optional().nullable(),
  location: optionalText(200),
  minExperience: z.number().min(0).max(60).optional().nullable(),
  maxExperience: z.number().min(0).max(60).optional().nullable(),
  requiredSkills: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  preferredSkills: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
});

export const grammarSchema = z.object({
  // Bounded so a paste of a whole handbook cannot become a huge prompt.
  text: z.string().trim().min(1, 'There is nothing to correct').max(10_000),
});

export const suggestSchema = z.object({
  field: assistFieldEnum,
  context: assistContextSchema,
  /** Skip the shared cache and ask the model again. */
  refresh: z.boolean().optional(),
});

/** User-typed additions, folded into the shared cache for the title. */
export const customItemsSchema = z.object({
  groupKey: z.string().trim().min(1).max(40),
  items: z.array(z.string().trim().min(1).max(300)).max(20),
});

export const enhanceSchema = z.object({
  field: assistFieldEnum,
  currentText: z.string().trim().max(10_000).optional().nullable(),
  selected: z.array(z.string().trim().min(1).max(300)).max(40).optional(),
  /**
   * Items the user typed into the picker. Saved to the shared title cache on
   * confirm — cancelling the dialog therefore stores nothing.
   */
  customItems: z.array(customItemsSchema).max(10).optional(),
  context: assistContextSchema,
});

export type GrammarInput = z.infer<typeof grammarSchema>;
export type SuggestInput = z.infer<typeof suggestSchema>;
export type EnhanceInput = z.infer<typeof enhanceSchema>;
