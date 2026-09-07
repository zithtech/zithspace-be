// src/modules/qa-scenarios/validators/index.ts
// Request shapes for every endpoint that writes.

import { z } from 'zod';

const uuid = z.string().uuid();

/** Ordered case ids. The array order IS the flow order — index becomes position. */
const noDuplicates = (ids: string[]) => new Set(ids).size === ids.length;
const caseIds = z
  .array(uuid)
  .max(500, 'A flow cannot hold more than 500 cases')
  .refine(noDuplicates, 'The same case is listed twice');
/** The same list, for the endpoints where an empty flow makes no sense. */
const nonEmptyCaseIds = z
  .array(uuid)
  .min(1, 'Select at least one case')
  .max(500, 'A flow cannot hold more than 500 cases')
  .refine(noDuplicates, 'The same case is listed twice');

export const createScenarioSchema = z.object({
  parent_test_case_id: uuid,
  name: z.string().trim().min(1, 'Give the test scenario a name').max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  /** Cases mapped at creation time, already in flow order. */
  case_ids: caseIds.optional(),
});

export const updateScenarioSchema = z.object({
  name: z.string().trim().min(1, 'Give the test scenario a name').max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
});

/** PUT /:id/cases — replaces the whole membership, in the order given. */
export const setScenarioCasesSchema = z.object({
  case_ids: caseIds,
});

/** POST /:id/cases — appends to the end of the flow, keeping what is there. */
export const addScenarioCasesSchema = z.object({
  case_ids: nonEmptyCaseIds,
});

/** PUT /reorder — the order of the flows themselves on the page. */
export const reorderScenariosSchema = z.object({
  parent_test_case_id: uuid,
  scenario_ids: z
    .array(uuid)
    .min(1, 'Nothing to reorder')
    .refine(noDuplicates, 'The same scenario is listed twice'),
});

export type CreateScenarioBody = z.infer<typeof createScenarioSchema>;
export type UpdateScenarioBody = z.infer<typeof updateScenarioSchema>;
