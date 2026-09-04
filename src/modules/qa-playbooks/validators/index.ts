// src/modules/qa-playbooks/validators/index.ts
// Request shapes for every endpoint that writes.

import { z } from 'zod';
import { CATEGORIES, LEVELS, REFERENCE_TYPES, RISKS, VISIBILITIES } from '../constants';

const uuid = z.string().uuid();

/* ── Generating test cases from a selection ──────────────────────────────── */

export const generateSchema = z.object({
  /** Recommendation ids selected in the reader. */
  item_ids: z.array(uuid).min(1, 'Select at least one recommendation').max(300),
  /** The business scenario the generated cases are filed under. */
  parent_title: z.string().trim().min(1, 'A scenario title is required').max(255),
  module_id: uuid,
  project_id: z.string().trim().min(1).nullable().optional(),
  feature: z.string().trim().max(255).nullable().optional(),
  status: z.enum(['Draft', 'Ready']).default('Draft'),
});

export type GenerateBody = z.infer<typeof generateSchema>;

/* ── Authoring ───────────────────────────────────────────────────────────── */

/**
 * `visibility` is accepted but never trusted: the controller downgrades any
 * non-super_admin request to 'workspace' before it reaches the database, and
 * the CHECK constraint in migration 002 refuses the pairing regardless.
 */
export const playbookMetaSchema = z.object({
  name: z.string().trim().min(1, 'A name is required').max(160),
  category: z.string().trim().min(1, 'A category is required').max(80),
  summary: z.string().trim().min(1, 'A summary is required').max(600),
  overview: z.string().trim().max(20000).default(''),
  version: z.string().trim().min(1).max(20).default('1.0'),
  changelog: z.string().trim().max(2000).nullable().optional(),
  visibility: z.enum(VISIBILITIES).default('workspace'),
  price_credits: z.number().int().min(0).max(1_000_000).nullable().optional(),
  price_amount: z.number().min(0).max(1_000_000).nullable().optional(),
  price_currency: z.string().trim().length(3).default('USD'),
});

export type PlaybookMetaBody = z.infer<typeof playbookMetaSchema>;

const exampleSchema = z.union([
  z.string().min(1).max(600),
  z.object({ input: z.string().max(600), verdict: z.string().max(200) }),
]);

/**
 * Unwraps the ways a link arrives when it was written by a chat model rather
 * than typed into a field.
 *
 *   "[https://x](https://x)"  markdown autolink — what every AI platform emits
 *   "[OWASP](https://x)"      markdown link with a label
 *   "<https://x>"             angle-bracketed, from RFC-style prose
 *
 * The intended value is unambiguous in all three, and bouncing an import over
 * three characters of punctuation would send the author back to re-run a prompt
 * that was substantively correct.
 */
function normalizeUrl(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  let url = value.trim();

  const markdown = url.match(/^\[[^\]]*\]\((.+)\)$/);
  if (markdown) url = markdown[1].trim();

  if (url.startsWith('<') && url.endsWith('>')) url = url.slice(1, -1).trim();

  return url;
}

/**
 * A pointer out of the playbook. `url` is optional: "OWASP ASVS §2.1" is a
 * useful reference with nothing to click, and refusing it would push authors
 * into pasting a search link instead.
 */
const referenceSchema = z.object({
  type: z.enum(REFERENCE_TYPES),
  name: z.string().trim().min(1, 'A reference needs a name').max(200),
  description: z.string().trim().max(600).default(''),
  url: z.preprocess(
    normalizeUrl,
    z
      .string()
      .trim()
      .max(600)
      .url('A reference link must be a full URL starting with http:// or https://')
      .nullable()
      .optional()
      .or(z.literal(''))
  ),
});

export const itemSchema = z.object({
  key: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().min(1, 'Every recommendation needs a title').max(240),
  what_to_test: z.string().trim().max(4000).default(''),
  examples: z.array(exampleSchema).max(40).default([]),
  expected: z.string().trim().max(4000).default(''),
  steps: z.array(z.string().trim().min(1).max(1000)).max(40).default([]),
  level: z.enum(LEVELS),
  category: z.enum(CATEGORIES),
  risk: z.enum(RISKS).default('medium'),
  why_it_matters: z.string().trim().max(2000).default(''),
  /** The state the system must be in before the check means anything. */
  preconditions: z.array(z.string().trim().min(1).max(600)).max(20).default([]),
  /** Variants worth a second pass — empty, maximum, unicode, concurrent. */
  edge_cases: z.array(z.string().trim().min(1).max(600)).max(30).default([]),
  references: z.array(referenceSchema).max(12).default([]),
  applies_when: z.record(z.string(), z.array(z.string())).default({}),
});

/**
 * Sections nest one level in the UI. The schema allows a second level so the
 * author form can grow without a migration; deeper trees are refused because
 * the reader has nowhere to render them.
 */
const childSectionSchema = z.object({
  key: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().min(1, 'Every section needs a title').max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  items: z.array(itemSchema).max(500).default([]),
  sections: z.array(z.any()).max(0).default([]),
});

const sectionSchema = z.object({
  key: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().min(1, 'Every section needs a title').max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  items: z.array(itemSchema).max(500).default([]),
  sections: z.array(childSectionSchema).max(50).default([]),
});

/**
 * The whole section tree is saved in one call and replaces what was there.
 * A playbook is edited as a document, so a partial save would let the author
 * end up with half of their reordering applied.
 */
export const contentSchema = z.object({
  sections: z.array(sectionSchema).min(1, 'Add at least one section').max(60),
  /** Bumping the version records a new row in the change history. */
  version: z.string().trim().min(1).max(20).optional(),
  changelog: z.string().trim().max(2000).nullable().optional(),
});

export type ContentBody = z.infer<typeof contentSchema>;

/* ── Bulk import ─────────────────────────────────────────────────────────── */

/**
 * A playbook authored somewhere else — typically by pasting the downloadable
 * template into an AI platform — arriving whole: its filing, its sections and
 * every recommendation in one object.
 *
 * Deliberately the SAME shapes the single-playbook endpoints take, so what an
 * author sees in the template is what the API accepts, with no translation
 * layer to drift.
 */
export const importSchema = z.object({
  playbooks: z
    .array(
      playbookMetaSchema.extend({
        sections: z.array(sectionSchema).min(1, 'Add at least one section').max(60),
      })
    )
    .min(1, 'The file contains no playbooks')
    // A cap, because each one is a create plus a full content write: a paste of
    // two hundred would tie up a connection for minutes.
    .max(25, 'Import at most 25 playbooks at a time'),
});

export type ImportBody = z.infer<typeof importSchema>;

export const publishSchema = z.object({
  status: z.enum(['draft', 'published', 'archived']),
});

/* ── Access ──────────────────────────────────────────────────────────────── */

export const unlockRequestSchema = z.object({
  message: z.string().trim().max(1000).nullable().optional(),
});

/* ── "Write us a playbook for this" ──────────────────────────────────────── */

export const playbookRequestSchema = z.object({
  title: z.string().trim().min(1, 'Say which feature needs a playbook').max(160),
  /** Free text on purpose: a request is where a category the library does not
      have yet shows up. */
  category: z.string().trim().max(80).nullable().optional(),
  details: z.string().trim().max(2000).nullable().optional(),
});

export const playbookRequestDecisionSchema = z.object({
  status: z.enum(['pending', 'planned', 'published', 'declined']),
  note: z.string().trim().max(1000).nullable().optional(),
  /** Set when the ask is answered with a playbook that now exists. */
  playbook_id: uuid.nullable().optional(),
});

export const grantSchema = z.object({
  tenant_id: uuid,
  note: z.string().trim().max(1000).nullable().optional(),
  /** ISO date; omit for perpetual access. */
  expires_at: z.string().datetime().nullable().optional(),
});

export const decisionSchema = z.object({
  decision: z.enum(['approved', 'declined']),
  note: z.string().trim().max(1000).nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
});

/* ── Zai ─────────────────────────────────────────────────────────────────── */

export const zaiDraftSchema = z.object({
  /** The one specific point the author wants covered. */
  point: z.string().trim().min(8, 'Describe the point in a little more detail').max(1200),
  playbook_name: z.string().trim().max(160).nullable().optional(),
  section_title: z.string().trim().max(200).nullable().optional(),
  /** Optional steer. Omit and Zai picks. */
  level: z.enum(LEVELS).nullable().optional(),
  category: z.enum(CATEGORIES).nullable().optional(),
});
