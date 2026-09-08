// src/modules/qa-playbooks/services/zaiRecommendation.ts
//
// Zai drafting a single playbook recommendation from one specific point the
// author types ("check the reset link cannot be reused").
//
// Uses the platform's tenant-aware provider resolution, so a tenant on its own
// key/model is honoured and the ZAI default is the fallback. Nothing here talks
// to a provider SDK directly.
//
// THE RULE THAT SHAPES THIS FILE: the model's output is parsed and then
// validated against `itemSchema` — the SAME schema the save endpoint enforces.
// Zai therefore cannot produce a recommendation that the author could preview,
// accept, and then fail to save. Anything the model gets wrong is either
// repaired here (clamped, defaulted) or rejected before the author ever sees it.

import { getAIProviderForTenant } from '@/services/ai/resolver';
import type { AIResponse } from '@/ai/interfaces/AIResponse';
import { CATEGORIES, CATEGORY_LABELS, LEVELS, REFERENCE_TYPES, RISKS } from '../constants';
import { itemSchema } from '../validators';
import { PlaybookError } from '../http';

export interface DraftInput {
  /** The author's specific point — the whole reason to call Zai. */
  point: string;
  playbookName: string;
  sectionTitle?: string;
  /** Optional steer; when absent Zai chooses and explains itself through the fields. */
  level?: string;
  category?: string;
}

/** Trim model output to the limits itemSchema enforces, rather than failing on them. */
const clamp = (value: unknown, max: number): string =>
  String(value ?? '')
    .trim()
    .slice(0, max);

function extractJson(raw: string): any {
  const cleaned = (raw || '')
    .replace(/^```[a-zA-Z]*\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Models sometimes wrap the object in prose — salvage the outermost braces.
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

export async function draftRecommendation(
  input: DraftInput,
  tenantId: string
): Promise<AIResponse<any>> {
  const provider = await getAIProviderForTenant(tenantId);
  if (!provider.isConfigured()) {
    throw new PlaybookError(
      'No AI provider is configured for this workspace — set one up in AI settings',
      400,
      'AI_NOT_CONFIGURED'
    );
  }

  const categoryList = CATEGORIES.map((c) => `${c} (${CATEGORY_LABELS[c]})`).join(', ');

  const prompt = `
You are a senior QA engineer writing ONE recommendation for a QA playbook.

Playbook: ${input.playbookName || 'Untitled'}
Section: ${input.sectionTitle || 'General'}

The specific point to cover:
${input.point}

${input.level ? `Write it at the "${input.level}" level.` : 'Choose the level that fits.'}
${input.category ? `Use the category "${input.category}".` : 'Choose the category that fits.'}

Return ONLY a JSON object with exactly these keys, no markdown fences, no commentary:
{
  "title": "short imperative title, max 90 characters, naming the check not the outcome",
  "what_to_test": "one or two sentences on the action a tester performs, concrete enough to follow without asking",
  "examples": [{"input": "a concrete value or condition", "verdict": "what should happen"}],
  "expected": "the single observable outcome that means this passed",
  "steps": ["one action per item, imperative, no leading numbers"],
  "preconditions": ["the state the system must already be in for this check to mean anything"],
  "edge_cases": ["a variant worth a second pass — empty, maximum, unicode, concurrent, offline"],
  "level": "one of: ${LEVELS.join(', ')}",
  "category": "one of: ${categoryList}",
  "risk": "one of: ${RISKS.join(', ')}",
  "why_it_matters": "one sentence on what breaks in production when this is skipped — concrete, not generic",
  "references": [{"type": "one of: ${REFERENCE_TYPES.join(', ')}", "name": "what the reference is called", "description": "one line on what the reader gets from it", "url": "a real, working URL, or omit the key entirely"}]
}

Rules:
- "steps" ONLY for a scenario worth walking through; use [] for a single check.
- 2 to 6 examples where concrete values help; [] where they do not.
- "why_it_matters" must name a real consequence, never "it is important to test this".
- "preconditions" only where setup is genuinely required; [] otherwise. Do not restate the steps.
- "edge_cases" are situations to go and look at, not inputs with verdicts — those are examples.
- "references": 0 to 3, and ONLY ones you are confident exist at that URL — a wrong link costs
  the reader more than a missing one. Prefer a named standard with no URL over an invented link.
  Vary the type: a QA guide, the security standard and something live to try are different answers
  to the same question.
- Write about the point given. Do not broaden it into a whole feature area.
`.trim();

  // Budget generously. A full recommendation runs ~700-1000 completion tokens on
  // its own, and a reasoning model spends more before it starts emitting; too
  // tight a cap truncates the JSON mid-object, which surfaces as a parse
  // failure rather than as the "ran out of room" it actually is.
  const result = await provider.generateText(prompt, {
    json: true,
    temperature: 0.4,
    maxOutputTokens: 4000,
  });

  const parsed = extractJson(result.text);
  if (!parsed || typeof parsed !== 'object') {
    // Log what actually came back — without it, a parse failure is unactionable.
    console.error(
      `[qa-playbooks] Zai output did not parse (model=${result.model}, ` +
        `completionTokens=${result.usage?.completionTokens}, chars=${(result.text || '').length}):`,
      (result.text || '').slice(0, 400)
    );
    throw new PlaybookError(
      'Zai returned an unexpected format. Try rephrasing the point.',
      502,
      'AI_BAD_FORMAT'
    );
  }

  // Repair before validating: a model that picks a category outside the closed
  // set should not cost the author their draft, so fall back rather than fail.
  const level = LEVELS.includes(parsed.level) ? parsed.level : input.level || 'intermediate';
  const category = CATEGORIES.includes(parsed.category)
    ? parsed.category
    : (input.category as any) || 'functional';
  const risk = RISKS.includes(parsed.risk) ? parsed.risk : 'medium';

  const examples = Array.isArray(parsed.examples)
    ? parsed.examples
        .slice(0, 12)
        .map((ex: any) =>
          ex && typeof ex === 'object' && 'input' in ex
            ? { input: clamp(ex.input, 600), verdict: clamp(ex.verdict, 200) }
            : clamp(ex, 600)
        )
        .filter((ex: any) => (typeof ex === 'string' ? ex : ex.input))
    : [];

  const steps = Array.isArray(parsed.steps)
    ? parsed.steps
        .slice(0, 20)
        .map((s: any) => clamp(String(s).replace(/^\d+[.)]\s*/, ''), 1000))
        .filter(Boolean)
    : [];

  const list = (value: any, max: number, cap: number) =>
    Array.isArray(value)
      ? value.slice(0, cap).map((v: any) => clamp(String(v), max)).filter(Boolean)
      : [];

  /* References are dropped rather than repaired when they are the wrong shape:
     a reference the author cannot trust is worse than none, and an invented
     type would fail the closed-set check on save anyway. */
  const references = Array.isArray(parsed.references)
    ? parsed.references
        .slice(0, 6)
        .map((ref: any) => {
          if (!ref || typeof ref !== 'object') return null;
          const type = REFERENCE_TYPES.includes(ref.type) ? ref.type : 'qa_guide';
          const name = clamp(ref.name, 200);
          if (!name) return null;
          const url = typeof ref.url === 'string' ? ref.url.trim() : '';
          return {
            type,
            name,
            description: clamp(ref.description, 600),
            // Anything that is not a plain http(s) URL is dropped, not guessed at.
            url: /^https?:\/\//i.test(url) ? clamp(url, 600) : null,
          };
        })
        .filter(Boolean)
    : [];

  const candidate = {
    title: clamp(parsed.title, 240),
    what_to_test: clamp(parsed.what_to_test, 4000),
    examples,
    expected: clamp(parsed.expected, 4000),
    steps,
    level,
    category,
    risk,
    why_it_matters: clamp(parsed.why_it_matters, 2000),
    preconditions: list(parsed.preconditions, 600, 10),
    edge_cases: list(parsed.edge_cases, 600, 12),
    references,
    applies_when: {},
  };

  // The same gate the save endpoint uses. If it does not pass here, it would
  // not have saved — better to say so now than after the author accepts it.
  const validated = itemSchema.safeParse(candidate);
  if (!validated.success) {
    throw new PlaybookError(
      'Zai returned a recommendation that was missing required fields. Try again.',
      502,
      'AI_INCOMPLETE'
    );
  }

  return {
    data: validated.data,
    provider: provider.name,
    model: result.model,
    usage: result.usage,
    metadata: {},
  };
}
