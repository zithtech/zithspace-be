// src/modules/opening-management/services/aiAssist.service.ts
//
// AI writing help for the opening form: grammar correction, suggestion lists,
// and content enhancement for the Job Description and Responsibilities fields.
//
// Uses the platform's tenant-aware provider resolution (services/ai/resolver),
// so a tenant on its own key/model is honoured automatically and the ZAI default
// is the fallback. Nothing here talks to a provider SDK directly.
//
// THE ONE RULE THAT SHAPES THE PROMPTS: "grammar" and "enhance" are different
// promises. Grammar must return the user's own words with the mistakes fixed —
// silently rewriting someone's text when they asked for a spellcheck is the
// fastest way to make an AI button untrustworthy. Enhance is where rewriting is
// invited.

import { getAIProviderForTenant } from '@/services/ai/resolver';
import { OpeningError } from '../types';
import * as cache from '../repositories/positionSuggestion.repo';
import {
  AssistContext,
  AssistField,
  SuggestionGroup,
  SuggestionResult,
} from './aiAssist.types';

export type { AssistContext, AssistField, SuggestionGroup, SuggestionResult };

const FIELD_LABEL: Record<AssistField, string> = {
  job_description: 'job description',
  responsibilities: 'responsibilities section',
};

/** Model output is untrusted text — never let it grow without bound. */
const MAX_OUTPUT_CHARS = 8000;

function clamp(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_OUTPUT_CHARS ? trimmed.slice(0, MAX_OUTPUT_CHARS) : trimmed;
}

/** Describe the opening in a compact block the model can condition on. */
function contextBlock(ctx: AssistContext): string {
  const lines: string[] = [`Job title: ${ctx.jobTitle}`];
  if (ctx.departmentName) lines.push(`Department: ${ctx.departmentName}`);
  if (ctx.employmentType) lines.push(`Employment type: ${ctx.employmentType.replace(/_/g, ' ')}`);
  if (ctx.workMode) lines.push(`Work mode: ${ctx.workMode}`);
  if (ctx.location) lines.push(`Location: ${ctx.location}`);
  if (ctx.minExperience != null || ctx.maxExperience != null) {
    lines.push(
      `Experience: ${ctx.minExperience ?? 0}–${ctx.maxExperience ?? '+'} years`
    );
  }
  if (ctx.requiredSkills?.length) lines.push(`Required skills: ${ctx.requiredSkills.join(', ')}`);
  if (ctx.preferredSkills?.length) lines.push(`Preferred skills: ${ctx.preferredSkills.join(', ')}`);
  return lines.join('\n');
}

/**
 * Strip the wrapping the models like to add — a leading "Sure, here's…",
 * markdown fences, or a restated heading. Callers want the content only.
 */
function stripPreamble(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^```[a-z]*\s*/i, '').replace(/```$/i, '');
  text = text.replace(/^(sure|certainly|here('s| is)[^\n:]*)[:\n]\s*/i, '');
  return text.trim();
}

/** Parse a JSON object out of a response that may still carry stray prose. */
function parseJsonObject(raw: string): any {
  const text = stripPreamble(raw);
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
  }
  throw OpeningError.badRequest('The AI response could not be read — try again');
}

function dedupeStrings(values: unknown, limit: number): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const item = v.trim().replace(/^[-•*]\s*/, '');
    if (!item || item.length > 160) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

async function generate(
  tenantId: string,
  prompt: string,
  opts: {
    systemInstruction: string;
    json?: boolean;
    temperature?: number;
    /** Enhance scales this with the number of selected points. */
    maxOutputTokens?: number;
  }
): Promise<string> {
  const provider = await getAIProviderForTenant(tenantId);
  if (!provider.isConfigured()) {
    throw OpeningError.badRequest(
      'No AI provider is configured for this tenant — set one up in AI settings'
    );
  }
  try {
    return await provider.generateText(prompt, {
      systemInstruction: opts.systemInstruction,
      json: opts.json,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens ?? 1600,
    });
  } catch (err: any) {
    console.error('[opening-management] AI generation failed:', err?.message ?? err);
    throw new OpeningError(502, 'AI_FAILED', 'The AI service did not respond — try again');
  }
}

// ─── Grammar ────────────────────────────────────────────────────────────────

const GRAMMAR_SYSTEM = `
You are a meticulous copy editor for HR job postings.

Fix ONLY objective errors: spelling, grammar, punctuation, capitalisation,
verb tense and subject-verb agreement.

You MUST NOT:
- reword sentences that are already correct
- add, remove or reorder any idea, requirement or bullet
- change the tone, formality or length
- convert between prose and bullets, or change the formatting
- add headings, commentary or explanations

Preserve line breaks, bullet characters and indentation exactly.
Return ONLY the corrected text — no preamble, no markdown fences.
If the text is already correct, return it unchanged.
`.trim();

/** Correct mistakes without rewriting. */
export async function fixGrammar(tenantId: string, text: string): Promise<string> {
  const source = text.trim();
  if (!source) throw OpeningError.badRequest('There is nothing to correct');

  const raw = await generate(tenantId, `Correct this text:\n\n${source}`, {
    systemInstruction: GRAMMAR_SYSTEM,
    // Near-deterministic: a spellcheck should give the same answer twice.
    temperature: 0.1,
  });
  return clamp(stripPreamble(raw));
}

// ─── Suggestions ────────────────────────────────────────────────────────────

const SUGGESTION_SYSTEM = `
You are an experienced technical recruiter who writes job postings.

Return ONLY valid JSON with this exact shape:
{
  "skills": ["..."],
  "focusAreas": ["..."],
  "points": ["..."]
}

Rules:
- "skills": concrete technologies, tools or domain skills for the role. 8-14 items,
  each 1-4 words.
- "focusAreas": themes the section should cover (e.g. "Team collaboration",
  "System design ownership"). 5-8 items, each 2-5 words.
- "points": ready-to-use sentences for the section. 6-10 items, each one line,
  starting with a verb where it reads naturally.
- Ground everything in the job title and the context given. Do not invent
  company names, salaries, locations or benefits.
- No duplicates. No markdown. No commentary.
`.trim();

/**
 * The suggestion list behind "Enhance content" — the skills and themes the user
 * ticks before anything is written. Offering the choices first is what keeps the
 * result theirs rather than the model's.
 *
 * CACHE FIRST. The answer for "Software Engineer" does not change between
 * clicks, so a hit on the shared position cache skips the model entirely. Only a
 * miss (or an explicit `refresh`) generates, and the result is written back.
 */
export async function suggest(
  tenantId: string,
  field: AssistField,
  ctx: AssistContext,
  opts: { refresh?: boolean } = {}
): Promise<SuggestionResult> {
  if (!ctx.jobTitle?.trim()) {
    throw OpeningError.badRequest('Enter a job title first — the suggestions are based on it');
  }
  const position = ctx.jobTitle.trim();

  if (!opts.refresh) {
    // A cache failure must not take the feature down — fall through to the model.
    const hit = await cache.find(position, field).catch(() => null);
    if (hit) return { groups: hit.groups, cached: true, position: hit.position };
  }

  const prompt = `
Suggest content for the ${FIELD_LABEL[field]} of this opening.

${contextBlock(ctx)}
`.trim();

  const raw = await generate(tenantId, prompt, {
    systemInstruction: SUGGESTION_SYSTEM,
    json: true,
    temperature: 0.7,
  });

  const parsed = parseJsonObject(raw);
  const groups: SuggestionGroup[] = [
    { key: 'skills', label: 'Skills & technologies', items: dedupeStrings(parsed.skills, 14) },
    { key: 'focusAreas', label: 'Areas to cover', items: dedupeStrings(parsed.focusAreas, 8) },
    {
      key: 'points',
      label: field === 'responsibilities' ? 'Suggested responsibilities' : 'Suggested points',
      items: dedupeStrings(parsed.points, 10),
    },
  ].filter((g) => g.items.length > 0);

  if (groups.length === 0) {
    throw new OpeningError(502, 'AI_FAILED', 'The AI returned no usable suggestions — try again');
  }

  // Write-through so the next person asking about this title pays nothing.
  // Never block the response on the cache write.
  cache.upsert(position, field, groups).catch((err) => {
    console.error('[opening-management] suggestion cache write failed:', err?.message ?? err);
  });

  return { groups, cached: false, position };
}

/**
 * Fold user-added items into the shared cache for this title.
 *
 * NOTE: the cache is cross-tenant by design (see 008_position_suggestions.sql),
 * so anything saved here becomes a suggestion for every tenant. Only items the
 * user explicitly typed into the picker reach this function.
 */
export async function saveCustomItems(
  position: string,
  field: AssistField,
  additions: { groupKey: string; items: string[] }[]
): Promise<void> {
  if (!position?.trim() || additions.length === 0) return;
  await cache.addCustomItems(position, field, additions).catch((err) => {
    console.error('[opening-management] custom suggestion save failed:', err?.message ?? err);
  });
}

// ─── Enhance ────────────────────────────────────────────────────────────────

const ENHANCE_SYSTEM = `
You are an experienced technical recruiter writing a job posting.

Write clear, specific, inclusive copy that a candidate would actually read.

THE MOST IMPORTANT RULE:
When the user gives you a list of points to include, EVERY SINGLE ONE must
appear in your output. Not a summary of them — all of them. Do not drop,
merge or silently generalise any point, however long the list is. If the list
is long, the output is long. Length always yields to coverage.

Other rules:
- Plain text only. Use "- " for bullets. No markdown headings, bold or fences.
- Do not invent company names, salaries, benefits, locations or team sizes.
- Do not add a heading that repeats the field name.
- Prefer concrete duties and outcomes over adjectives.
- Use inclusive, neutral language; no age, gender or nationality signals.
- Return ONLY the finished text — no preamble, no commentary.
`.trim();

/**
 * Items short enough that the model should reproduce them near-verbatim — a
 * skill or a theme, not a sentence. Only these can be coverage-checked by
 * substring; longer points are legitimately paraphrased.
 */
function isCheckable(item: string): boolean {
  return item.trim().split(/\s+/).length <= 4;
}

/** Selected short items that did not make it into the generated text. */
function missingFrom(text: string, selected: string[]): string[] {
  const haystack = text.toLowerCase();
  return selected.filter((item) => isCheckable(item) && !haystack.includes(item.trim().toLowerCase()));
}

export interface EnhanceInput {
  field: AssistField;
  currentText?: string | null;
  /** Suggestions the user ticked in the popup. */
  selected?: string[];
  context: AssistContext;
}

export interface EnhanceResult {
  text: string;
  /** Short selected items still absent after the retry — surfaced, not hidden. */
  missing: string[];
}

/**
 * Write or improve the field.
 *
 * With existing text, the draft is the substance and the model tightens it —
 * a user who has written three careful lines should not lose them. With none,
 * it writes from the title, context and whatever the user ticked.
 */
export async function enhance(
  tenantId: string,
  input: EnhanceInput
): Promise<EnhanceResult> {
  const ctx = input.context;
  if (!ctx?.jobTitle?.trim()) {
    throw OpeningError.badRequest('Enter a job title first — the content is based on it');
  }

  const existing = (input.currentText ?? '').trim();
  const selected = (input.selected ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 60);

  const parts = [
    `Write the ${FIELD_LABEL[input.field]} for this opening.`,
    '',
    contextBlock(ctx),
  ];

  if (selected.length) {
    parts.push(
      '',
      `The user selected ${selected.length} point(s) to include. Your output MUST cover`,
      `all ${selected.length}. Give each its own bullet, or fold it into a sentence that`,
      'clearly states it. Do not omit any, and do not compress several into one vague line:',
      ...selected.map((s) => `- ${s}`),
      '',
      `Before you answer, check every one of the ${selected.length} points appears.`
    );
  }

  if (existing) {
    parts.push(
      '',
      'Existing draft — keep its meaning and specifics, improve the clarity and structure:',
      existing
    );
  } else {
    parts.push('', 'There is no existing draft. Write it from scratch.');
  }

  // Headroom scales with the list: ~60 tokens per selected point, because the
  // old fixed ceiling truncated long selections mid-sentence.
  const maxOutputTokens = Math.min(6000, Math.max(1600, 600 + selected.length * 60));

  let text = clamp(
    stripPreamble(
      await generate(tenantId, parts.join('\n'), {
        systemInstruction: ENHANCE_SYSTEM,
        temperature: 0.6,
        maxOutputTokens,
      })
    )
  );

  // Coverage is the whole promise of the picker, so verify it rather than trust
  // it. Only short items are checkable — a full sentence is fairly paraphrased.
  let missing = missingFrom(text, selected);
  if (missing.length > 0) {
    const retry = [
      'Your previous answer left out points the user explicitly selected.',
      '',
      'Previous answer:',
      text,
      '',
      'Missing points — rewrite the text so every one of these appears, keeping',
      'everything already covered:',
      ...missing.map((m) => `- ${m}`),
      '',
      'Return ONLY the rewritten text.',
    ].join('\n');

    try {
      const second = clamp(
        stripPreamble(
          await generate(tenantId, retry, {
            systemInstruction: ENHANCE_SYSTEM,
            temperature: 0.4,
            maxOutputTokens,
          })
        )
      );
      const stillMissing = missingFrom(second, selected);
      // Only take the retry if it actually covered more.
      if (second && stillMissing.length < missing.length) {
        text = second;
        missing = stillMissing;
      }
    } catch {
      // The first answer is still usable — report what it missed instead of failing.
    }
  }

  return { text, missing };
}
