// src/modules/qa-playbooks/services/zaiPlaybooksFromDocument.ts
//
// Zai turning a requirements document — a PRD, a spec, a feature brief — into
// playbooks the QA can review and import.
//
// WHY THIS PATH EXISTS: the template + prompt route hands the writing to an AI
// platform the customer already pays for. This is the same job done in-product
// for someone who would rather upload the document than copy a prompt around,
// and it is metered like every other Zai call.
//
// THE RULE, as in zaiRecommendation.ts: whatever comes back is parsed, repaired
// where repair is unambiguous, and then validated against the SAME schema the
// import endpoint enforces. Zai cannot produce a playbook that previews cleanly
// and then fails to import.

import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

import { getAIProviderForTenant } from '@/services/ai/resolver';
import type { AIResponse } from '@/ai/interfaces/AIResponse';
import { CATEGORIES, CATEGORY_LABELS, LEVELS, REFERENCE_TYPES, RISKS } from '../constants';
import { importSchema } from '../validators';
import { PlaybookError } from '../http';

/**
 * How much of the document reaches the model.
 *
 * A 60-page PRD is mostly rollout plans, pricing tables and stakeholder lists
 * that produce nothing testable, and sending all of it costs credits for tokens
 * that earn nothing. The head of the document is where the behaviour lives.
 */
const MAX_DOCUMENT_CHARS = 24000;

/** Control characters survive PDF extraction and confuse the model. */
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]', 'g');

export interface DocumentInput {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

/** Plain text out of the formats a PRD actually arrives in. */
export async function extractDocumentText(input: DocumentInput): Promise<string> {
  const name = (input.filename || '').toLowerCase();
  const type = input.mimetype || '';

  try {
    if (type === 'application/pdf' || name.endsWith('.pdf')) {
      const data = await pdfParse(input.buffer);
      return String(data.text ?? '');
    }

    if (
      type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      type === 'application/msword' ||
      name.endsWith('.docx')
    ) {
      const result = await mammoth.extractRawText({ buffer: input.buffer });
      return String(result.value ?? '');
    }

    // Markdown, plain text, and anything else that is really just text.
    if (type.startsWith('text/') || /\.(txt|md|markdown|rtf)$/.test(name)) {
      return input.buffer.toString('utf-8');
    }
  } catch (err: any) {
    console.error(`[qa-playbooks] could not read ${input.filename}:`, err?.message);
    throw new PlaybookError(
      `Could not read ${input.filename}. If it is a scanned PDF there is no text in it to extract.`,
      400,
      'DOCUMENT_UNREADABLE'
    );
  }

  throw new PlaybookError(
    'Upload a PDF, Word document, Markdown or text file.',
    400,
    'DOCUMENT_UNSUPPORTED'
  );
}

/**
 * Document Hub pages are BlockNote JSON, not a file — flatten them to the same
 * plain text an uploaded PRD becomes, so both sources meet at one code path.
 *
 * Headings keep their markdown hashes and list items their dashes: structure is
 * most of what tells a model "this is a requirement" rather than prose.
 */
export function blocksToText(blocks: any, depth = 0): string {
  if (!Array.isArray(blocks)) return '';

  const lines: string[] = [];

  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;

    const inline = Array.isArray(block.content)
      ? block.content
          .map((piece: any) =>
            typeof piece === 'string' ? piece : String(piece?.text ?? '')
          )
          .join('')
      : '';

    const indent = '  '.repeat(depth);

    switch (block.type) {
      case 'heading': {
        const level = Number(block.props?.level ?? 2);
        lines.push(`\n${'#'.repeat(Math.min(Math.max(level, 1), 6))} ${inline}`);
        break;
      }
      case 'bulletListItem':
        lines.push(`${indent}- ${inline}`);
        break;
      case 'numberedListItem':
        lines.push(`${indent}1. ${inline}`);
        break;
      case 'checkListItem':
        lines.push(`${indent}- [${block.props?.checked ? 'x' : ' '}] ${inline}`);
        break;
      case 'table': {
        // Rows are the cells' text, tab separated — enough for a model to read
        // a limits table without reproducing the markup.
        const rows = block.content?.rows ?? [];
        for (const row of rows) {
          const cells = (row?.cells ?? []).map((cell: any) => blocksToText(cell, 0).trim());
          if (cells.some(Boolean)) lines.push(`${indent}${cells.join('\t')}`);
        }
        break;
      }
      default:
        if (inline.trim()) lines.push(`${indent}${inline}`);
    }

    if (Array.isArray(block.children) && block.children.length > 0) {
      const nested = blocksToText(block.children, depth + 1);
      if (nested.trim()) lines.push(nested);
    }
  }

  return lines.join('\n');
}

/**
 * An empty completion is not a formatting problem, and saying so sends people
 * off to shorten a document that was never the issue.
 *
 * It happens when a reasoning model spends the whole max_tokens budget thinking:
 * usage reports the tokens as spent, and `content` comes back blank. Told
 * apart here so the message names the real cause and the log carries the
 * number to raise.
 */
function assertAnswered(result: { text: string; usage?: any; model: string }, what: string): void {
  if ((result.text || '').trim().length > 0) return;

  console.error(
    `[qa-playbooks] empty completion trying to ${what} ` +
      `(model=${result.model}, completionTokens=${result.usage?.completionTokens}) — ` +
      'the model used its whole output budget without answering'
  );
  throw new PlaybookError(
    'Zai used its whole response budget without answering. This usually means the model was asked for too much at once — try fewer playbooks, or a shorter document.',
    502,
    'AI_NO_OUTPUT'
  );
}

function extractJson(raw: string): any {
  const cleaned = (raw || '')
    .replace(/^```[a-zA-Z]*\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
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

const clamp = (value: unknown, max: number): string =>
  String(value ?? '')
    .trim()
    .slice(0, max);

const asStrings = (value: unknown, cap: number, max: number): string[] =>
  Array.isArray(value)
    ? value
        .slice(0, cap)
        .map((v) => clamp(v, max))
        .filter(Boolean)
    : [];

/** Chat models write links as markdown; unwrap rather than lose the reference. */
function cleanUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let url = value.trim();
  const markdown = url.match(/^\[[^\]]*\]\((.+)\)$/);
  if (markdown) url = markdown[1].trim();
  if (url.startsWith('<') && url.endsWith('>')) url = url.slice(1, -1).trim();
  return /^https?:\/\//i.test(url) ? url.slice(0, 600) : null;
}

/** Trimmed, de-controlled, and refused early when there is nothing to read. */
function prepareDocument(text: string): string {
  const document = String(text ?? '')
    .replace(CONTROL_CHARS, ' ')
    .replace(/[ \t]{3,}/g, '  ')
    .trim()
    .slice(0, MAX_DOCUMENT_CHARS);

  if (document.length < 200) {
    throw new PlaybookError(
      'There is not enough text in that document to write playbooks from.',
      400,
      'DOCUMENT_TOO_SHORT'
    );
  }
  return document;
}

/* Repaired, not refused — the author reviews every one of these in the import
   preview before anything is created, so a recommendation sitting at a
   defaulted level beats the whole batch being thrown away for it. */
function repairItem(row: any) {
  return {
    title: clamp(row?.title, 240),
    what_to_test: clamp(row?.what_to_test, 4000),
    expected: clamp(row?.expected, 4000),
    why_it_matters: clamp(row?.why_it_matters, 2000),
    steps: asStrings(row?.steps, 20, 1000),
    preconditions: asStrings(row?.preconditions, 20, 600),
    edge_cases: asStrings(row?.edge_cases, 30, 600),
    examples: Array.isArray(row?.examples)
      ? row.examples
          .slice(0, 12)
          .map((ex: any) =>
            ex && typeof ex === 'object' && 'input' in ex
              ? { input: clamp(ex.input, 600), verdict: clamp(ex.verdict, 200) }
              : clamp(ex, 600)
          )
          .filter((ex: any) => (typeof ex === 'string' ? ex : ex.input))
      : [],
    references: Array.isArray(row?.references)
      ? row.references
          .slice(0, 6)
          .map((ref: any) => ({
            type: REFERENCE_TYPES.includes(ref?.type) ? ref.type : 'qa_guide',
            name: clamp(ref?.name, 200),
            description: clamp(ref?.description, 600),
            url: cleanUrl(ref?.url),
          }))
          .filter((ref: any) => ref.name)
      : [],
    level: LEVELS.includes(row?.level) ? row.level : 'intermediate',
    category: CATEGORIES.includes(row?.category) ? row.category : 'functional',
    risk: RISKS.includes(row?.risk) ? row.risk : 'medium',
    applies_when:
      row?.applies_when && typeof row.applies_when === 'object' ? row.applies_when : {},
  };
}

function repairSection(row: any, depth: number): any {
  return {
    title: clamp(row?.title, 200) || 'Untitled section',
    description: clamp(row?.description, 4000),
    items: Array.isArray(row?.items) ? row.items.map(repairItem).filter((i: any) => i.title) : [],
    // The reader renders one level of nesting and the schema refuses more, so a
    // deeper tree is flattened away rather than failing the whole document.
    sections:
      depth === 0 && Array.isArray(row?.sections)
        ? row.sections.map((child: any) => repairSection(child, 1))
        : [],
  };
}

export interface FromDocumentInput {
  text: string;
  /** What the author said the document is about, if anything. */
  hint?: string;
  /** Ceiling on how many playbooks to write. */
  maxPlaybooks: number;
}

/**
 * TWO PASSES, AND WHY.
 *
 * The first version of this asked for everything at once: up to five playbooks,
 * each with up to forty fully written recommendations. That is several hundred
 * JSON objects in one completion — past any sane output cap, so the answer
 * either truncated mid-object (surfacing as a parse failure after minutes of
 * waiting) or simply never arrived before the client gave up.
 *
 * So it is split:
 *
 *   outlinePlaybooksFromDocument   filing, sections, and the TITLE of each
 *                                  recommendation. Small, and quick.
 *   expandPlaybookOutline          one playbook at a time, writing the bodies
 *                                  for the titles the outline already fixed.
 *
 * Each call is bounded, and the caller gets real per-playbook progress instead
 * of one long silence.
 */
export async function outlinePlaybooksFromDocument(
  input: FromDocumentInput,
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

  const document = prepareDocument(input.text);
  const categoryList = CATEGORIES.map((c) => `${c} (${CATEGORY_LABELS[c]})`).join(', ');

  const prompt = `
You are a senior QA engineer reading a product requirements document and planning QA
playbooks from it.

This is the PLANNING pass. Titles only — no recommendation bodies, and no overview
prose. Another pass writes all of that. Keep every string here short: a long plan is a
plan that runs out of room before it is finished.

${input.hint ? `The author says this document covers: ${input.hint}` : ''}

Read the document and identify the distinct testable features. Write at most
${input.maxPlaybooks} playbooks — one per feature. Prefer fewer, deeper playbooks over
many thin ones.

Return ONLY a JSON object, no markdown fences, no commentary:

{
  "playbooks": [
    {
      "category": "the area it belongs to, e.g. Authentication",
      "name": "the feature, e.g. Login",
      "summary": "one line a QA reads on the catalog card",
      "sections": [
        {
          "title": "Basic Testing",
          "description": "one line on what this group is for",
          "item_titles": [
            "short imperative title naming one check",
            "another check"
          ]
        }
      ]
    }
  ]
}

RULES
- Plan what the DOCUMENT describes. Do not invent features it does not mention. If it
  describes fewer than ${input.maxPlaybooks} distinct features, write fewer playbooks —
  the number above is a ceiling, not a target.
- 2 to 5 sections per playbook, and 4 to 10 item titles per section.
- An item title names ONE check. If a title needs an "and", it is two items.
- Cover more than the happy path: negative cases, states, boundaries, permissions,
  security, and what the document leaves unsaid.
- Categories a section may draw from: ${categoryList}

THE DOCUMENT:
"""
${document}
"""
`.trim();

  const result = await provider.generateText(prompt, {
    json: true,
    temperature: 0.35,
    /**
     * Titles only — but the floor is high because max_tokens is the whole
     * completion, reasoning included. deepseek-v4-pro spent an entire 3,500
     * budget thinking and emitted nothing at all, which arrived here as an
     * unparseable empty string. Six thousand plus room per playbook leaves the
     * answer somewhere to go.
     */
    maxOutputTokens: Math.min(32000, 8000 + input.maxPlaybooks * 900),
  });

  assertAnswered(result, 'plan playbooks from that document');

  const parsed = extractJson(result.text);
  if (!parsed || typeof parsed !== 'object') {
    console.error(
      `[qa-playbooks] outline did not parse (model=${result.model}, ` +
        `completionTokens=${result.usage?.completionTokens}):`,
      (result.text || '').slice(0, 400)
    );
    throw new PlaybookError(
      'Zai returned an unexpected format for that document. Try again, or upload a shorter section of it.',
      502,
      'AI_BAD_FORMAT'
    );
  }

  const outline = (Array.isArray(parsed.playbooks) ? parsed.playbooks : [])
    .slice(0, input.maxPlaybooks)
    .map((row: any) => ({
      category: clamp(row?.category, 80) || 'Uncategorised',
      name: clamp(row?.name, 160),
      summary: clamp(row?.summary, 600),
      sections: (Array.isArray(row?.sections) ? row.sections : [])
        .slice(0, 8)
        .map((section: any) => ({
          title: clamp(section?.title, 200) || 'Untitled section',
          description: clamp(section?.description, 4000),
          item_titles: asStrings(section?.item_titles ?? section?.items, 12, 240),
        }))
        .filter((section: any) => section.item_titles.length > 0),
    }))
    .filter((row: any) => row.name && row.sections.length > 0);

  if (outline.length === 0) {
    throw new PlaybookError(
      'Zai could not find a testable feature in that document. Try a section of it that describes behaviour rather than plans.',
      422,
      'AI_NO_PLAYBOOKS'
    );
  }

  return {
    data: { outline, document },
    provider: provider.name,
    model: result.model,
    usage: result.usage,
    metadata: {},
  };
}

export interface ExpandInput {
  /** The document text, handed back by the outline pass. */
  document: string;
  /** One planned playbook: its filing, sections and item titles. */
  outline: any;
}

/**
 * Writes the bodies for ONE playbook the outline already planned.
 *
 * Bounded on purpose: one playbook of two to five sections is a completion the
 * model finishes in well under a minute, which is what makes per-playbook
 * progress possible and truncation unlikely.
 */
export async function expandPlaybookOutline(
  input: ExpandInput,
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

  const document = prepareDocument(input.document);
  const outline = input.outline ?? {};
  const categoryList = CATEGORIES.map((c) => `${c} (${CATEGORY_LABELS[c]})`).join(', ');
  const referenceTypes = REFERENCE_TYPES.join(', ');

  const plan = (Array.isArray(outline.sections) ? outline.sections : [])
    .slice(0, 8)
    .map(
      (section: any) =>
        `- ${clamp(section?.title, 200)}: ${asStrings(section?.item_titles, 12, 240)
          .map((title) => `"${title}"`)
          .join(', ')}`
    )
    .join('\n');

  const prompt = `
You are a senior QA engineer writing ONE QA playbook that has already been planned.

Playbook: ${clamp(outline.name, 160)}
Category: ${clamp(outline.category, 80)}
Summary:  ${clamp(outline.summary, 600)}

The plan — write EXACTLY these sections, and one recommendation case per title:

${plan}

Return ONLY a JSON object, no markdown fences, no commentary:

{
  "overview": "two short markdown paragraphs: how to use this playbook, what it assumes, and where the real defects in this feature tend to be",
  "sections": [
    {
      "title": "exactly the section title from the plan",
      "description": "one line on what this group is for",
      "items": [
        {
          "title": "exactly the item title from the plan",
          "what_to_test": "the action a tester performs, concrete enough to follow",
          "preconditions": ["the state the system must already be in"],
          "steps": ["one action per item, imperative, no leading numbers"],
          "examples": [{"input": "a concrete value", "verdict": "what should happen"}],
          "expected": "the single observable outcome that means this passed",
          "edge_cases": ["a variant worth a second pass"],
          "why_it_matters": "what breaks in production when this is skipped",
          "level": "one of: ${LEVELS.join(', ')}",
          "category": "one of: ${categoryList}",
          "risk": "one of: ${RISKS.join(', ')}",
          "references": [{"type": "one of: ${referenceTypes}", "name": "...", "description": "...", "url": "a real URL or omit"}],
          "applies_when": {}
        }
      ]
    }
  ]
}

RULES
- Keep the plan's section titles and item titles exactly. Do not add, drop or rename.
- Write from what the DOCUMENT says. Where it is silent on a limit, a state or a
  permission, write the recommendation as the question to answer, not as an assumption.
- "level", "category" and "risk" must come from the lists above, exactly.
- "examples" are inputs WITH a verdict; "edge_cases" are situations to go and look at.
- "why_it_matters" must name a real consequence, never "it is important to test this".
- References: at most one per item, and only where you are confident it exists. A named
  standard with no URL beats an invented link. "url" is a plain URL string, never a
  markdown link.
- Keep every field tight. Two sentences is usually enough.

THE DOCUMENT:
"""
${document}
"""
`.trim();

  const result = await provider.generateText(prompt, {
    json: true,
    temperature: 0.35,
    maxOutputTokens: 12000,
  });

  assertAnswered(result, `write "${clamp(outline.name, 60)}"`);

  const parsed = extractJson(result.text);
  if (!parsed || typeof parsed !== 'object') {
    console.error(
      `[qa-playbooks] expand did not parse for "${clamp(outline.name, 60)}" ` +
        `(model=${result.model}, completionTokens=${result.usage?.completionTokens}):`,
      (result.text || '').slice(0, 400)
    );
    throw new PlaybookError(
      `Zai could not finish "${clamp(outline.name, 60)}". Try that document again.`,
      502,
      'AI_BAD_FORMAT'
    );
  }

  const sections = (Array.isArray(parsed.sections) ? parsed.sections : [])
    .map((section: any) => repairSection(section, 0))
    .filter((section: any) => section.items.length > 0 || section.sections.length > 0);

  const playbook = {
    category: clamp(outline.category, 80) || 'Uncategorised',
    name: clamp(outline.name, 160),
    summary: clamp(outline.summary, 600),
    // Written here rather than in the plan: two paragraphs per playbook is the
    // single biggest string in the output, and in the planning pass it crowded
    // out the titles it was supposed to be listing.
    overview: clamp(parsed.overview ?? outline.overview, 20000),
    version: '1.0',
    sections,
  };

  // The same gate the import endpoint uses: what previews here must import.
  const validated = importSchema.safeParse({ playbooks: [playbook] });
  if (!validated.success) {
    console.error(
      '[qa-playbooks] expanded playbook failed its own import schema:',
      JSON.stringify(validated.error.issues.slice(0, 5))
    );
    throw new PlaybookError(
      `Zai wrote "${playbook.name}" in a shape that would not import. Try again.`,
      502,
      'AI_INVALID_OUTPUT'
    );
  }

  return {
    data: { playbook: (validated.data as any).playbooks[0] },
    provider: provider.name,
    model: result.model,
    usage: result.usage,
    metadata: {},
  };
}
