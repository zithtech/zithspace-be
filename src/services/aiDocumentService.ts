/**
 * AI Document Generation Service
 *
 * Converts a free-form user prompt into a structured documentation page
 * (hub name + first file title + HTML content). Uses the configured AI
 * provider (see services/ai) when one is set; otherwise falls back to a
 * deterministic heuristic so the feature still works in local/dev
 * environments without a key.
 *
 * Distinct from aiTicketService — that service produces work items
 * ("Implement X"), this one produces *reference documentation* prose.
 */

import { AIProvider, AIGenerateResult, AIProviderName } from "./ai";
import { getAIProviderForTenant } from "./ai/resolver";
import { AIResponse } from "../ai/interfaces/AIResponse";

export interface AiDocumentDraft {
  /** Suggested name for the document hub. */
  hubName: string;
  /** Suggested title for the first/only file inside the hub. */
  fileTitle: string;
  /** HTML body for the file (headings, paragraphs, lists). */
  contentHtml: string;
}

const SYSTEM_PROMPT = `
You are a senior technical writer producing the FINAL documentation page that a
reader will see — not a brief, not a spec, not a ticket.

Return ONLY valid JSON with this exact shape:
{
  "hubName":     "<concise 3-7 word hub name>",
  "fileTitle":   "<concise 2-6 word page title>",
  "contentHtml": "<HTML body of the documentation page>"
}

Hard rules:
- Treat this as a Wikipedia-style or developer-docs-style article. Write the
  ACTUAL content (definitions, explanations, examples, prose) — never write
  meta-instructions like "Provide a definition of X" or "Explain Y" or
  "Outline how Z works". Actually provide / explain / outline.
- Do NOT include sections titled "Acceptance criteria", "Scope", "Behavior",
  "Context", "Workflow" (label-style), or anything resembling a ticket
  template.
- Do NOT use imperative verbs like "Implement", "Build", "Create", "Add",
  "Provide", "Outline", "Detail", "Highlight" as section headings or as bullet
  starters. Headings should be noun phrases ("How it works", "Examples",
  "Common pitfalls"), bullets should be informative sentences.
- Do NOT phrase the hubName or fileTitle as a task ("Implement X", "Add Y").
  Phrase them as a topic ("Debouncing in JavaScript", "Payments API
  Reference").

Content formatting rules:
- "contentHtml" MUST be HTML using <h2>, <h3>, <p>, <ul>, <li>, <strong>,
  <em>, <code>, <pre>. No <html>, <head>, <body>, <h1>, no inline styles.
- Start with one or two introductory <p> paragraphs that directly answer /
  define the topic.
- Then add <h2> sections appropriate to the topic (How it works, Examples,
  Use cases, Common pitfalls, Best practices, etc.). Only include sections
  that genuinely apply.
- Each section must contain real prose. Use bullets for genuinely
  enumerable items, not as a substitute for paragraphs.

Do not wrap the JSON in markdown fences. Do not include any prose outside
the JSON.
`;

const USER_TEMPLATE = (input: string) =>
  `Topic to document:\n${input}\n\nReturn JSON only.`;

/* ------------------------------------------------------------------------ */
/* AI provider plumbing (retry/quota handling lives in services/ai).        */
/* ------------------------------------------------------------------------ */

// Captures the most-recent provider failure so callers can surface it.
let lastAiError: string | null = null;

/* ------------------------------------------------------------------------ */
/* Output validation & cleanup                                              */
/* ------------------------------------------------------------------------ */

const FORBIDDEN_TITLE_PREFIXES = /^\s*(implement|build|create|add|develop|design)\s+/i;

function cleanTitle(raw: string, fallback: string): string {
  const cleaned = (raw || "").replace(FORBIDDEN_TITLE_PREFIXES, "").trim();
  return (cleaned || fallback).slice(0, 100);
}

/**
 * Defensive cleanup of HTML body: strip ticket-template artifacts that may
 * still slip through despite the prompt directive.
 */
function cleanHtml(raw: string): string {
  if (!raw) return "<p></p>";
  let html = String(raw).trim();

  // Drop everything from "Acceptance criteria" onward.
  const acceptanceIdx = html.search(
    /<(?:p|h[1-6]|strong|b)[^>]*>\s*acceptance criteria/i,
  );
  if (acceptanceIdx !== -1) {
    html = html.slice(0, acceptanceIdx);
  }

  // Strip leading "Overview:", "Scope:", "Behavior:", "Context:", "Workflow:"
  // labels at the start of <li>/<p> elements (keeps the prose after them).
  const leadingLabels =
    /(<(?:li|p)[^>]*>)\s*(?:<strong>|<b>)?\s*(overview|scope|behavior|context|workflow|key concepts|use cases|best practices(?:\s*&\s*pitfalls)?|pitfalls)\s*:?\s*(?:<\/strong>|<\/b>)?\s*/gi;
  html = html.replace(leadingLabels, "$1");

  return html.trim() || "<p></p>";
}

function safeParseJson(raw: string): any | null {
  if (!raw) return null;
  // Strip ```json fences if the model added them despite instructions.
  const stripped = raw
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // Try to extract the first {...} block.
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function callAi(prompt: string, provider: AIProvider): Promise<{ draft: AiDocumentDraft; res: any } | null> {
  if (!provider.isConfigured()) return null;

  lastAiError = null;
  try {
    const res = await provider.generateText(USER_TEMPLATE(prompt), {
      systemInstruction: SYSTEM_PROMPT,
      json: true,
      temperature: 0.5,
      maxOutputTokens: 4096,
    });
    const parsed = safeParseJson(res.text);
    if (!parsed) {
      lastAiError = `${provider.name} returned non-JSON output`;
      return null;
    }

    const hubName = cleanTitle(String(parsed.hubName || ""), prompt.slice(0, 60));
    const fileTitle = cleanTitle(String(parsed.fileTitle || ""), "Overview");
    const contentHtml = cleanHtml(String(parsed.contentHtml || ""));

    return { draft: { hubName, fileTitle, contentHtml }, res };
  } catch (err: any) {
    lastAiError = err?.message || `${provider.name} call failed`;
    console.error("[aiDocumentService] AI error:", err);
    return null;
  }
}

/* ------------------------------------------------------------------------ */
/* Heuristic fallback (no API key / Gemini failure)                         */
/* ------------------------------------------------------------------------ */

function heuristicDraft(prompt: string): AiDocumentDraft {
  const trimmed = prompt.trim();
  const topicSentence = trimmed.replace(/[?.!]+$/, "");
  const titleish = topicSentence
    .replace(/^(what\s+is|how\s+does|how\s+do|how\s+to|why\s+is|tell\s+me\s+about|explain)\s+/i, "")
    .replace(/[?]+/g, "");

  const fileTitle = (titleish.slice(0, 60) || "Overview").trim();
  const hubName = (titleish.slice(0, 60) || "New Document").trim();

  const contentHtml = [
    `<p>${topicSentence}.</p>`,
    `<h2>Overview</h2>`,
    `<p>This page is a placeholder generated without an AI provider. Configure an AI provider (<code>GEMINI_API_KEY</code> or <code>DEEPSEEK_API_KEY</code>) on the server to enable richer, automatically-generated documentation.</p>`,
    `<h2>Notes</h2>`,
    `<ul><li>Edit this page directly to add real content.</li><li>You can use <strong>headings</strong>, <em>emphasis</em>, lists, and code blocks.</li></ul>`,
  ].join("");

  return { hubName, fileTitle, contentHtml };
}

/* ------------------------------------------------------------------------ */
/* Public entry point                                                       */
/* ------------------------------------------------------------------------ */

/* ------------------------------------------------------------------------ */
/* Selection rewrite — used by the inline Zai menu in the editor.           */
/* ------------------------------------------------------------------------ */

const REWRITE_SYSTEM_PROMPT = `
You are a senior technical writer rewriting a SHORT excerpt from a documentation
page according to a transformation instruction.

Return ONLY valid JSON with this exact shape:
{
  "rewrittenHtml": "<HTML rewrite of the user-provided text>"
}

Hard rules:
- Preserve the user's intent and factual content; only the form/style changes.
- Output HTML using <p>, <ul>, <li>, <ol>, <strong>, <em>, <code>, <pre>.
  No <html>, <head>, <body>, <h1>, no inline styles. <h2>/<h3> are allowed
  only if the original was a heading.
- Do NOT add commentary, preamble, or quotes around the result.
- Do NOT include any meta-instructions ("Provide…", "Outline…").
- Do NOT add new factual claims that weren't in the original — paraphrase /
  reformat / restructure only.
- If the instruction asks for bullets, return a real <ul>/<ol>. If it asks for
  prose, return <p> paragraphs.
- Keep approximately the same length unless the instruction explicitly asks
  for shorter or longer.

Do not wrap the JSON in markdown fences.
`;

const REWRITE_USER_TEMPLATE = (text: string, instruction: string) =>
  `Instruction: ${instruction}\n\nOriginal text:\n${text}\n\nReturn JSON only.`;

async function callAiRewrite(
  text: string,
  instruction: string,
  provider: AIProvider,
): Promise<{ rewrittenHtml: string; res: AIGenerateResult } | null> {
  if (!provider.isConfigured()) return null;

  lastAiError = null;
  try {
    const res = await provider.generateText(
      REWRITE_USER_TEMPLATE(text, instruction),
      {
        systemInstruction: REWRITE_SYSTEM_PROMPT,
        json: true,
        temperature: 0.4,
        maxOutputTokens: 2048,
      },
    );
    const parsed = safeParseJson(res.text);
    if (!parsed) {
      lastAiError = `${provider.name} returned non-JSON output`;
      return null;
    }
    return { rewrittenHtml: cleanHtml(String(parsed.rewrittenHtml || "")), res };
  } catch (err: any) {
    lastAiError = err?.message || `${provider.name} call failed`;
    console.error("[aiDocumentService] AI rewrite error:", err);
    return null;
  }
}

/** Trivial fallback when Gemini is unavailable: wrap the original text in a <p>. */
function heuristicRewrite(text: string, instruction: string): string {
  const lower = instruction.toLowerCase();
  if (/bullet|points|list/.test(lower)) {
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length > 1) {
      return `<ul>${sentences.map((s) => `<li>${s}</li>`).join("")}</ul>`;
    }
  }
  return `<p>${text}</p>`;
}

export async function rewriteSelection(
  text: string,
  instruction: string,
  tenantId?: string,
): Promise<AIResponse<{ rewrittenHtml: string }>> {
  const provider = await getAIProviderForTenant(tenantId);
  const fromAi = await callAiRewrite(text, instruction, provider);
  if (fromAi) {
    return {
        data: { rewrittenHtml: fromAi.rewrittenHtml },
        provider: provider.name,
        model: fromAi.res.model,
        usage: fromAi.res.usage,
        metadata: {}
    };
  }

  const reason = !provider.isConfigured()
    ? `${provider.name} is not configured`
    : (lastAiError || `${provider.name} call failed`);

  return {
    data: { rewrittenHtml: heuristicRewrite(text, instruction) },
    provider: "mock",
    model: "mock",
    usage: { promptTokens: 0, completionTokens: 0 },
    metadata: { finishReason: reason }
  };
}

export async function generateDocumentDraft(prompt: string, tenantId?: string): Promise<AIResponse<AiDocumentDraft>> {
  const provider = await getAIProviderForTenant(tenantId);
  const fromAi = await callAi(prompt, provider);
  if (fromAi) {
    return {
        data: fromAi.draft,
        provider: provider.name,
        model: fromAi.res.model,
        usage: fromAi.res.usage,
        metadata: {}
    };
  }

  const reason = !provider.isConfigured()
    ? `${provider.name} is not configured`
    : (lastAiError || `${provider.name} call failed`);
  console.warn(`[aiDocumentService] falling back to heuristic mock — ${reason}`);

  return {
      data: heuristicDraft(prompt),
      provider: "mock",
      model: "mock",
      usage: { promptTokens: 0, completionTokens: 0 },
      metadata: { finishReason: reason }
  };
}
