// src/modules/hotspot/services/circulationAi.service.ts
//
// AI writing help for the Circulation composer: draft an update from a one-line
// brief ("Create with Zai"), and fix grammar without rewriting.
//
// Uses the platform's tenant-aware provider resolution (services/ai/resolver),
// so a tenant on its own key/model is honoured automatically and the ZAI default
// is the fallback. Nothing here talks to a provider SDK directly.
//
// THE ONE RULE THAT SHAPES THIS FILE: "compose" and "grammar" are different
// promises. Compose is invited to write. Grammar must give back the user's own
// words with the mistakes fixed — and, because the composer holds HTML, it must
// give back the user's own MARKUP too.
//
// How grammar keeps that promise (this is the important bit):
//   Sending HTML to a model and asking it to "preserve the tags" is a promise
//   the model cannot keep — it drops attributes, closes tags differently, and
//   the user's formatting quietly degrades. So the markup never reaches the
//   model at all. We split the HTML into tags and text runs, send ONLY the text
//   runs as a JSON array, require an array of the same length back, and splice
//   the corrections into the original document. The tags are untouched by
//   construction, not by instruction.

import { getAIProviderForTenant } from '@/services/ai/resolver';
import { sanitizeHtmlContent, stripHtmlTags } from '@/utils/htmlSanitizer';
import { HotspotError } from '../types';
import type { ComposeInput } from '../validators/circulationAi.validator';

/** Model output is untrusted text — never let it grow without bound. */
const MAX_BODY_CHARS = 20_000;
const MAX_TITLE_CHARS = 250;

/** Guardrails for the grammar splice. */
const MAX_GRAMMAR_SEGMENTS = 400;
const MAX_GRAMMAR_TEXT_CHARS = 12_000;

async function generate(
  tenantId: string,
  prompt: string,
  opts: {
    systemInstruction: string;
    json?: boolean;
    temperature?: number;
    maxOutputTokens?: number;
  }
): Promise<string> {
  const provider = await getAIProviderForTenant(tenantId);
  if (!provider.isConfigured()) {
    throw HotspotError.badRequest(
      'No AI provider is configured for this tenant — set one up in AI settings'
    );
  }
  try {
    return await provider.generateText(prompt, {
      systemInstruction: opts.systemInstruction,
      json: opts.json,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens ?? 1800,
    });
  } catch (err: any) {
    console.error('[hotspot] AI generation failed:', err?.message ?? err);
    throw new HotspotError(502, 'AI_FAILED', 'The AI service did not respond — try again');
  }
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

/** Parse a JSON value out of a response that may still carry stray prose. */
function parseJson(raw: string, open: '{' | '[', close: '}' | ']'): any {
  const text = stripPreamble(raw);
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf(open);
    const end = text.lastIndexOf(close);
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
  }
  throw HotspotError.badRequest('The AI response could not be read — try again');
}

// ─── Compose ────────────────────────────────────────────────────────────────

const CATEGORY_BRIEF: Record<string, string> = {
  general: 'a general company update',
  announcement: 'a company-wide announcement',
  policy: 'a policy or process change everyone must follow',
  event: 'an upcoming company event',
  celebration: 'good news worth celebrating (a win, a milestone, a recognition)',
  alert: 'an urgent notice that needs immediate attention',
};

const TONE_BRIEF: Record<string, string> = {
  neutral: 'clear and matter-of-fact',
  friendly: 'warm and conversational, without being flippant',
  formal: 'formal and precise',
  urgent: 'direct and urgent, leading with what must be done',
  celebratory: 'upbeat and appreciative',
};

const COMPOSE_SYSTEM = `
You write internal company noticeboard updates for an employee intranet.

Return ONLY valid JSON with this exact shape:
{
  "title": "...",
  "body": "<p>...</p>"
}

Rules for "title":
- One line, 4-12 words, sentence case. No trailing full stop. No emoji.
- It must say what happened, not tease it.

Rules for "body":
- Simple HTML only. Allowed tags: <p>, <strong>, <em>, <ul>, <ol>, <li>, <h3>, <br>.
- No inline styles, classes, ids, links, images, scripts or tables.
- 2-5 short paragraphs, or a short lead paragraph followed by a bulleted list.
- Lead with the single most important fact. Put dates, deadlines and required
  actions in a list so they cannot be missed.
- Write for every employee: no team jargon, no acronyms without expansion.

You MUST NOT:
- invent facts, names, dates, numbers, policies or links that are not in the brief
- add a sign-off, a greeting, or "let me know if you need anything"
- add commentary about being an AI, or markdown fences
- write a subject line, "Dear team", or email framing

If the brief is thin, write only what it supports. A shorter honest update beats
a padded one.
`.trim();

export interface ComposeResult {
  title: string;
  /** Sanitised HTML, ready for the editor. */
  body: string;
}

/** Draft a circulation update from a short brief. */
export async function compose(tenantId: string, input: ComposeInput): Promise<ComposeResult> {
  // A tenant-defined category has no canned description, so lean on the label
  // the tenant chose — "an update filed under Town hall" beats "town_hall".
  const categoryBrief =
    CATEGORY_BRIEF[input.category] ??
    (input.categoryLabel?.trim()
      ? `an update filed under "${input.categoryLabel.trim()}"`
      : CATEGORY_BRIEF.general);

  const lines = [
    `Category: ${categoryBrief}`,
    `Tone: ${TONE_BRIEF[input.tone] ?? TONE_BRIEF.neutral}`,
    '',
    'Brief from the person posting:',
    input.brief,
  ];

  if (input.currentTitle?.trim()) {
    lines.push('', `They have already drafted this title — refine it, do not replace the meaning: ${input.currentTitle.trim()}`);
  }

  const existing = input.currentBody ? stripHtmlTags(input.currentBody).trim() : '';
  if (existing) {
    lines.push(
      '',
      'They have already drafted this body. Keep every fact in it, improve the',
      'structure and clarity, and fold in anything from the brief that is missing:',
      existing.slice(0, 6_000)
    );
  }

  const raw = await generate(tenantId, lines.join('\n'), {
    systemInstruction: COMPOSE_SYSTEM,
    json: true,
    temperature: 0.55,
    maxOutputTokens: 1800,
  });

  const parsed = parseJson(raw, '{', '}');
  const title = String(parsed?.title ?? '').trim().slice(0, MAX_TITLE_CHARS);
  const bodyRaw = String(parsed?.body ?? '').trim().slice(0, MAX_BODY_CHARS);

  if (!title && !bodyRaw) {
    throw HotspotError.badRequest('The AI returned nothing usable — try a longer brief');
  }

  return { title, body: sanitizeHtmlContent(bodyRaw) };
}

// ─── Grammar ────────────────────────────────────────────────────────────────

const GRAMMAR_SYSTEM = `
You are a meticulous copy editor for internal company announcements.

You receive a JSON array of text fragments taken from one document, in order.

Return ONLY a JSON array of the SAME LENGTH, in the SAME ORDER, where each entry
is the corresponding fragment with objective errors fixed: spelling, grammar,
punctuation, capitalisation, verb tense and subject-verb agreement.

You MUST NOT:
- merge, split, add or drop fragments — the array length must match exactly
- reword a fragment that is already correct (return it byte-identical)
- add, remove or reorder any idea, fact, name, date or number
- change the tone, formality or length
- add or remove HTML, markdown, bullet characters or quotation styling
- translate, or change regional spelling conventions

A fragment may be a sentence fragment, a single word, or whitespace-adjacent
text. Correct it in place and return it. If a fragment needs no change, return
it exactly as received.
`.trim();

/** A text run in the document, with the whitespace that surrounds it. */
interface TextRun {
  /** Index into the split parts array. */
  index: number;
  lead: string;
  core: string;
  trail: string;
}

/**
 * Split HTML into alternating text/tag parts, and pick out the text runs worth
 * correcting. Whitespace and entity-only runs are left alone — sending them
 * wastes tokens and invites the model to "tidy" spacing it should not touch.
 */
export function splitTextRuns(html: string): { parts: string[]; runs: TextRun[] } {
  const parts = html.split(/(<[^>]*>)/);
  const runs: TextRun[] = [];

  parts.forEach((part, index) => {
    if (part.startsWith('<')) return;
    // Needs at least one letter to be worth correcting — pure punctuation,
    // numbers, whitespace or `&nbsp;` runs are skipped.
    if (!/[A-Za-z]/.test(part.replace(/&[a-z]+;/gi, ''))) return;

    const match = part.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!match) return;
    runs.push({ index, lead: match[1], core: match[2], trail: match[3] });
  });

  return { parts, runs };
}

export interface GrammarResult {
  html: string;
  changed: boolean;
}

/**
 * Correct mistakes without rewriting — and without touching the markup.
 *
 * Returns the document unchanged (`changed: false`) when there is nothing with
 * letters in it, rather than burning an AI call on an empty draft.
 */
export async function fixGrammar(tenantId: string, html: string): Promise<GrammarResult> {
  const { parts, runs } = splitTextRuns(html);

  if (runs.length === 0) {
    return { html, changed: false };
  }
  if (runs.length > MAX_GRAMMAR_SEGMENTS) {
    throw HotspotError.badRequest(
      'This update is too long to check in one pass — shorten it and try again'
    );
  }

  const totalChars = runs.reduce((sum, r) => sum + r.core.length, 0);
  if (totalChars > MAX_GRAMMAR_TEXT_CHARS) {
    throw HotspotError.badRequest(
      'This update is too long to check in one pass — shorten it and try again'
    );
  }

  const raw = await generate(tenantId, JSON.stringify(runs.map((r) => r.core)), {
    systemInstruction: GRAMMAR_SYSTEM,
    json: true,
    // Near-deterministic: a spellcheck should give the same answer twice.
    temperature: 0.1,
    maxOutputTokens: 2400,
  });

  const parsed = parseJson(raw, '[', ']');
  if (!Array.isArray(parsed) || parsed.length !== runs.length) {
    // Splicing a mismatched array would silently scramble the document. Refuse.
    throw new HotspotError(
      502,
      'AI_FAILED',
      'The grammar check came back malformed and was discarded — your text is unchanged'
    );
  }

  const next = [...parts];
  let changed = false;

  runs.forEach((run, i) => {
    const corrected = typeof parsed[i] === 'string' ? (parsed[i] as string).trim() : run.core;
    // An empty correction means the model dropped the fragment — keep the original.
    const value = corrected.length > 0 ? corrected : run.core;
    if (value !== run.core) changed = true;
    next[run.index] = `${run.lead}${value}${run.trail}`;
  });

  return { html: changed ? sanitizeHtmlContent(next.join('')) : html, changed };
}
