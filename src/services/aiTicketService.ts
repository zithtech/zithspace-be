/**
 * AI Ticket Generation Service
 *
 * Converts a free-form user description into a structured Jira-style ticket.
 * Uses the configured AI provider (see services/ai) when one is configured;
 * otherwise falls back to a deterministic heuristic mock so the feature works
 * out of the box.
 */

import { AIProvider, AIProviderName } from "./ai";
import { getAIProviderForTenant } from "./ai/resolver";

export type AiTicketPriority = "Low" | "Medium" | "High";

export interface AiSubtask {
  title: string;
  /** Per-subtask estimated effort in hours. */
  hours: number;
}

export interface AiTicketDraft {
  title: string;
  description: string;
  priority: AiTicketPriority;
  subtasks: AiSubtask[];
  /** Total estimated effort in hours for the whole ticket (sum across subtasks). */
  totalHours: number;
}

const SYSTEM_PROMPT = `
You are a senior product manager. Convert user input into a Jira-style ticket.

Return ONLY valid JSON with this exact shape:
{
  "title": "4-10 word outcome-focused title",
  "description": "<HTML description as a bullet/numbered list>",
  "priority": "Low" | "Medium" | "High",
  "subtasks": [{ "title": "imperative subtask", "hours": <integer> }, ...],
  "totalHours": <integer estimated effort in hours for the whole ticket>
}

Subtask rules:
- 3 to 6 items.
- Each subtask has a "title" (imperative, e.g. "Implement X", "Add Y test") and an integer "hours" estimate.
- The sum of subtask hours should be approximately equal to "totalHours".

Effort-estimation rules:
- "totalHours" is an INTEGER (no decimals, no string), the realistic engineering effort to complete ALL subtasks combined, including testing.
- Typical ranges: a small bug fix = 2-6h, a medium feature = 8-24h, a large feature = 32-80h. Never return 0.
- Do NOT mention hours inside the description — keep effort only in the structured fields.

Description formatting rules (IMPORTANT):
- The "description" field MUST be HTML, formatted as a list — never a plain paragraph.
- Use <ul><li>…</li></ul> for unordered points, or <ol><li>…</li></ol> for ordered steps.
- Each <li> is one short, scannable bullet covering: context, scope, behavior, and acceptance criteria.
- Aim for 4–8 bullets total. Group acceptance criteria under a clear heading like <p><strong>Acceptance criteria</strong></p><ul>…</ul>.
- Do not wrap the JSON in markdown fences. Do not include any prose outside the JSON.

Other rules:
- Title is concise and outcome-focused (no "Create a ticket for…").
- Priority reflects user-stated urgency; default to "Medium" when unclear.
- Subtasks are imperative ("Implement X", "Add Y test"), 3 to 6 items.
`;

const USER_TEMPLATE = (input: string) => `User input:\n${input}\n\nReturn JSON only.`;

// Captures the most-recent provider failure reason so the public entry points
// can surface it to callers (controller → frontend) instead of swallowing it.
// Transport-level retry / quota handling lives in the provider (see services/ai).
let lastAiError: string | null = null;

async function callAi(description: string, provider: AIProvider): Promise<AiTicketDraft | null> {
  if (!provider.isConfigured()) return null;

  lastAiError = null;

  // Attempt up to 2 calls so a single bad-JSON response doesn't drop us to the
  // heuristic mock. The second attempt nudges the model with an explicit
  // "previous output was malformed" hint to push it back onto the rails.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const userPrompt =
        attempt === 1
          ? USER_TEMPLATE(description)
          : `${USER_TEMPLATE(description)}\n\nIMPORTANT: Return ONLY a single valid JSON object. No prose, no markdown, no trailing commas. Make sure every string and brace is properly closed.`;

      const text = (await provider.generateText(userPrompt, {
        systemInstruction: SYSTEM_PROMPT,
        // Forces parseable JSON instead of prose/fences.
        json: true,
        temperature: 0.4,
        // 4096 leaves enough headroom for ~6 subtasks + HTML description without
        // the response getting truncated mid-JSON.
        maxOutputTokens: 4096,
      }))?.trim();
      if (!text) {
        lastAiError = `${provider.name} returned an empty response`;
        console.error(lastAiError);
        if (attempt === 2) return null;
        continue;
      }

      const parsed = parseAiJson(text);
      if (parsed) return parsed;

      lastAiError = `${provider.name} response was not valid JSON`;
      console.error(`${lastAiError} (attempt ${attempt}/2)`, "raw:", text.slice(0, 600));
      // Loop and retry on the second attempt with the strengthened prompt.
    } catch (err: any) {
      lastAiError = String(err?.message || err || `Unknown ${provider.name} error`);
      console.error("AI call failed:", err);
      return null;
    }
  }

  return null;
}

/**
 * Best-effort JSON repair for common Gemini quirks:
 *   - markdown fences
 *   - leading prose before the first `{`
 *   - trailing prose after the matched `}`
 *   - smart/curly quotes
 *   - trailing commas before `}` or `]`
 *   - truncated output (cut off mid-string/object) — walks back to the last
 *     balanced `}` so we can salvage a partial response
 */
function tryRepairJson(raw: string): string | null {
  if (!raw) return null;

  // Strip markdown fences and leading/trailing whitespace.
  let s = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // Locate the first '{' — anything before it is prose noise.
  const start = s.indexOf("{");
  if (start === -1) return null;
  s = s.slice(start);

  // Replace smart/curly quotes that the model occasionally introduces.
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

  // Walk forward and track brace/bracket depth, ignoring chars inside strings.
  // Returns the substring up to the position where depth returns to zero.
  // If the input is truncated and never closes, returns null.
  const findBalanced = (input: string): string | null => {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = 0; i < input.length; i++) {
      const c = input[i];
      if (inString) {
        if (escape) escape = false;
        else if (c === "\\") escape = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") {
        depth--;
        if (depth === 0) return input.slice(0, i + 1);
      }
    }
    return null;
  };

  let candidate = findBalanced(s);

  // If no balanced match (truncated mid-object), try stitching closers on.
  // Walk back to the last position where we have a clean shallow context.
  if (!candidate) {
    let depth = 0;
    let inString = false;
    let escape = false;
    let lastSafe = -1;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inString) {
        if (escape) escape = false;
        else if (c === "\\") escape = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") depth--;
      // Track the last position at depth=1 just after a value boundary — a
      // safe place to chop and add a closing brace.
      if (!inString && depth === 1 && (c === "," || c === '"' || c === "}" || c === "]")) {
        lastSafe = i;
      }
    }
    if (lastSafe > 0) {
      // Chop at the last safe point and close any open structures.
      let truncated = s.slice(0, lastSafe + 1).replace(/,\s*$/, "");
      // Re-walk to compute remaining depth after the chop.
      let depth2 = 0;
      let inStr = false;
      let esc = false;
      const stack: string[] = [];
      for (const c of truncated) {
        if (inStr) {
          if (esc) esc = false;
          else if (c === "\\") esc = true;
          else if (c === '"') inStr = false;
          continue;
        }
        if (c === '"') inStr = true;
        else if (c === "{") {
          stack.push("}");
          depth2++;
        } else if (c === "[") {
          stack.push("]");
          depth2++;
        } else if (c === "}" || c === "]") {
          stack.pop();
          depth2--;
        }
      }
      while (stack.length) truncated += stack.pop();
      candidate = truncated;
    }
  }

  if (!candidate) return null;

  // Strip trailing commas before } or ]: ',]' or ',}'.
  candidate = candidate.replace(/,(\s*[}\]])/g, "$1");

  return candidate;
}

function parseAiJson(text: string): AiTicketDraft | null {
  // Direct attempt first — fast path for well-formed responses.
  const trimmed = text.trim();
  try {
    return normalizeDraft(JSON.parse(trimmed));
  } catch {
    /* fall through */
  }

  // Repair pass for common Gemini quirks (fences, trailing commas, truncation).
  const repaired = tryRepairJson(trimmed);
  if (!repaired) return null;
  try {
    return normalizeDraft(JSON.parse(repaired));
  } catch {
    return null;
  }
}

function normalizeDraft(obj: any): AiTicketDraft {
  const priority = (() => {
    const p = String(obj?.priority || "").toLowerCase();
    if (p.startsWith("h")) return "High" as const;
    if (p.startsWith("l")) return "Low" as const;
    return "Medium" as const;
  })();

  const totalHours = coerceTotalHours(obj?.totalHours, Array.isArray(obj?.subtasks) ? obj.subtasks.length : 0);
  const finalSubtasks = normalizeSubtasks(obj?.subtasks, totalHours);

  return {
    title: String(obj?.title || "").trim().slice(0, 120) || "Untitled ticket",
    description: ensureHtmlList(String(obj?.description || "").trim()),
    priority,
    subtasks: finalSubtasks,
    totalHours,
  };
}

/**
 * Coerce subtasks into AiSubtask[]. Handles three shapes the model might emit:
 *   - ["title 1", "title 2", ...]                    (legacy / fallback)
 *   - [{ title, hours }, ...]                        (preferred)
 *   - [{ title, estimatedHours / estimateHours }]    (common renamings)
 *
 * If hours are missing, splits totalHours evenly across the items so each
 * subtask always has a sensible estimate.
 */
function normalizeSubtasks(raw: any, totalHours: number): AiSubtask[] {
  let items: AiSubtask[] = [];

  if (Array.isArray(raw)) {
    items = raw
      .map((s: any) => {
        if (typeof s === "string") return { title: s.trim(), hours: 0 };
        if (s && typeof s === "object") {
          const title = String(s.title ?? s.name ?? "").trim();
          const hoursRaw = s.hours ?? s.estimateHours ?? s.estimatedHours ?? s.estimate ?? 0;
          const hoursNum = typeof hoursRaw === "number" ? hoursRaw : parseFloat(String(hoursRaw));
          const hours = Number.isFinite(hoursNum) && hoursNum > 0 ? Math.max(1, Math.round(hoursNum)) : 0;
          return { title, hours };
        }
        return { title: "", hours: 0 };
      })
      .filter((s) => s.title)
      .slice(0, 8);
  }

  if (items.length === 0) {
    items = [
      { title: "Investigate the request", hours: 0 },
      { title: "Implement changes", hours: 0 },
      { title: "Add tests", hours: 0 },
    ];
  }

  // If any subtask is missing hours, split totalHours evenly across the missing ones.
  const missing = items.filter((s) => s.hours === 0);
  if (missing.length > 0 && totalHours > 0) {
    const usedHours = items.reduce((sum, s) => sum + s.hours, 0);
    const remaining = Math.max(0, totalHours - usedHours);
    const perItem = Math.max(1, Math.round(remaining / missing.length));
    for (const s of items) if (s.hours === 0) s.hours = perItem;
  } else if (missing.length > 0) {
    for (const s of items) if (s.hours === 0) s.hours = 4;
  }

  return items;
}

/**
 * Coerce the model's totalHours into a sane positive integer. Falls back to a
 * subtask-count-based estimate so the field is always populated.
 */
function coerceTotalHours(raw: any, subtaskCount: number): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  if (Number.isFinite(n) && n > 0) return Math.max(1, Math.round(n));
  // Fallback: ~4h per subtask, clamped to a useful range.
  return Math.max(4, Math.min(80, subtaskCount * 4));
}

/**
 * Guarantee the description renders as a bullet/numbered list in TiptapEditor.
 * If the model returned proper HTML with a list, keep it. Otherwise convert
 * markdown-style bullets / numbered lines / plain newlines into <ul><li> HTML.
 */
function ensureHtmlList(input: string): string {
  if (!input) return "";

  // Already contains a list — assume the model followed instructions.
  if (/<\s*(ul|ol)\b/i.test(input)) return input;

  // Split into non-empty lines and detect bullet/number prefixes.
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";

  const bulletRe = /^([-*•·]|\d+[.)])\s+/;
  const items: string[] = [];
  const paragraphs: string[] = [];
  let currentItem: string | null = null;

  for (const line of lines) {
    if (bulletRe.test(line)) {
      if (currentItem) items.push(currentItem);
      currentItem = line.replace(bulletRe, "");
    } else if (currentItem) {
      currentItem += " " + line;
    } else {
      paragraphs.push(line);
    }
  }
  if (currentItem) items.push(currentItem);

  // No bullets detected: split on sentences/newlines and force bullets.
  if (items.length === 0) {
    const sentenceItems = lines.flatMap((l) =>
      l.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean),
    );
    return `<ul>${sentenceItems.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`;
  }

  const intro = paragraphs.length ? `<p>${escapeHtml(paragraphs.join(" "))}</p>` : "";
  return `${intro}<ul>${items.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Heuristic fallback used when no API key is configured. It mirrors the shape of
 * a Claude response so the frontend behaves identically against either source.
 */
function heuristicDraft(description: string): AiTicketDraft {
  const trimmed = description.trim();
  const firstSentence = trimmed.split(/[.!?\n]/)[0].trim();
  const title =
    firstSentence.length > 0 && firstSentence.length <= 80
      ? capitalize(firstSentence)
      : capitalize(trimmed.slice(0, 60)) + (trimmed.length > 60 ? "…" : "");

  const lowered = trimmed.toLowerCase();
  const priority: AiTicketPriority = /(\bp0\b|urgent|asap|critical|blocker|outage|production down)/.test(lowered)
    ? "High"
    : /(\bp3\b|nice to have|low priority|whenever|minor)/.test(lowered)
      ? "Low"
      : "Medium";

  const isBug = /(bug|broken|fails?|error|crash|regress|not working|flicker)/.test(lowered);
  const isFeature = /(add|build|create|implement|new feature|introduce|launch)/.test(lowered);

  let subtaskTitles: string[];
  if (isBug) {
    subtaskTitles = [
      "Reproduce the issue locally and capture logs",
      "Identify the root cause in the affected module",
      "Implement the fix and add a regression test",
      "Verify the fix in staging across affected platforms",
    ];
  } else if (isFeature) {
    subtaskTitles = [
      "Define API contract and data model",
      "Implement backend endpoint and persistence",
      "Build the UI and wire up state",
      "Add tests and update documentation",
    ];
  } else {
    subtaskTitles = [
      "Clarify requirements and acceptance criteria",
      "Break down implementation steps",
      "Implement the change",
      "Validate and add tests",
    ];
  }

  const description_out =
    `<p>${escapeHtml(trimmed)}</p>` +
    `<p><strong>Acceptance criteria</strong></p>` +
    `<ul>` +
    `<li>The behavior described above is implemented and verified.</li>` +
    `<li>Code is covered by tests where applicable.</li>` +
    `<li>No regressions in adjacent flows.</li>` +
    `</ul>`;

  // Heuristic effort estimate: bug fixes are smaller, features bigger,
  // and high-priority work usually carries more scope/coordination.
  const baseHours = isBug ? 4 : isFeature ? 24 : 12;
  const priorityBump = priority === "High" ? 1.25 : priority === "Low" ? 0.85 : 1;
  const totalHours = Math.max(2, Math.round(baseHours * priorityBump));

  // Split totalHours across subtasks so each carries its own estimate.
  const perSubtask = Math.max(1, Math.round(totalHours / subtaskTitles.length));
  const subtasks: AiSubtask[] = subtaskTitles.map((t) => ({ title: t, hours: perSubtask }));

  return { title, description: description_out, priority, subtasks, totalHours };
}

function capitalize(s: string) {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Public entry point. Always resolves to a valid AiTicketDraft.
 */
export async function generateTicketDraft(description: string, tenantId?: string): Promise<{
  draft: AiTicketDraft;
  source: AIProviderName | "mock";
  /** Populated only when source === "mock", explains why we fell back. */
  fallbackReason?: string;
}> {
  const provider = await getAIProviderForTenant(tenantId);
  const fromAi = await callAi(description, provider);
  if (fromAi) return { draft: fromAi, source: provider.name };

  const reason = !provider.isConfigured()
    ? `${provider.name} is not configured`
    : (lastAiError || `${provider.name} call failed`);
  console.warn(`[aiTicketService] falling back to heuristic mock — ${reason}`);

  return { draft: heuristicDraft(description), source: "mock", fallbackReason: reason };
}

/* ------------------------------------------------------------------------ */
/* Subtasks-only regeneration: take a description + desired shape (count and */
/* hours-each) and return a fresh, titled subtask list.                     */
/* ------------------------------------------------------------------------ */

export interface GenerateSubtasksInput {
  description: string;
  /** Desired number of subtasks (clamped to 2..12). */
  count?: number;
  /** Desired hours per subtask (clamped to 1..40). */
  hoursEach?: number;
}

const SUBTASK_SYSTEM_PROMPT = `
You are a senior engineering manager. Break a Jira ticket into a precise list
of imperative subtasks.

Return ONLY valid JSON with this exact shape:
{
  "subtasks": [{ "title": "imperative subtask title", "hours": <integer> }, ...]
}

Rules:
- Use the EXACT count of subtasks requested by the caller.
- Each "hours" should match the requested hours-each value (integer).
- Titles must be imperative ("Implement X", "Add Y test"), specific, and developer-ready.
- No prose, no markdown, no fences. JSON only.
`;

async function callAiForSubtasks(
  description: string,
  count: number,
  hoursEach: number,
  provider: AIProvider,
): Promise<AiSubtask[] | null> {
  if (!provider.isConfigured()) return null;

  lastAiError = null;
  const prompt = `Ticket description:\n${description}\n\nReturn EXACTLY ${count} subtasks, each ~${hoursEach} hours.`;

  try {
    const text = (await provider.generateText(prompt, {
      systemInstruction: SUBTASK_SYSTEM_PROMPT,
      json: true,
      temperature: 0.4,
      // Bumped from 1024 — long subtask lists with hours can otherwise
      // truncate and produce invalid JSON.
      maxOutputTokens: 2048,
    }))?.trim();
    if (!text) return null;

    // Try the same lenient parser used for the main flow. Falls back to a
    // simpler regex extraction if the repair helper doesn't yield a result.
    let parsed: any = null;
    try {
      parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim());
    } catch {
      const repaired = tryRepairJson(text);
      if (!repaired) {
        const m = text.match(/\{[\s\S]*\}/);
        if (!m) return null;
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          return null;
        }
      } else {
        try {
          parsed = JSON.parse(repaired);
        } catch {
          return null;
        }
      }
    }

    // Reuse the same normalizer as the main flow, then enforce the requested
    // hoursEach so callers can trust the shape.
    const items = normalizeSubtasks(parsed?.subtasks, count * hoursEach);
    return items.slice(0, count).map((s) => ({ title: s.title, hours: hoursEach }));
  } catch (err: any) {
    lastAiError = String(err?.message || err || "Unknown AI error");
    console.error("AI subtasks call failed:", err);
    return null;
  }
}

/** Heuristic fallback for subtask regeneration when Gemini is unavailable. */
function heuristicSubtasks(description: string, count: number, hoursEach: number): AiSubtask[] {
  const trimmed = description.trim().toLowerCase();
  const isBug = /(bug|broken|fails?|error|crash|regress|not working|flicker)/.test(trimmed);
  const verbs = isBug
    ? ["Reproduce", "Diagnose", "Patch", "Test", "Verify", "Document", "Deploy", "Monitor"]
    : ["Plan", "Design", "Implement", "Wire up", "Test", "Document", "Review", "Ship"];

  return Array.from({ length: count }, (_, i) => ({
    title: `${verbs[i % verbs.length]} part ${i + 1} of the ticket`,
    hours: hoursEach,
  }));
}

export async function generateSubtasks(input: GenerateSubtasksInput, tenantId?: string): Promise<{
  subtasks: AiSubtask[];
  source: AIProviderName | "mock";
  fallbackReason?: string;
}> {
  const description = String(input.description || "").trim();
  // Clamp inputs into safe ranges so a bad client can't ask for 1000 subtasks.
  const count = clamp(Math.round(input.count ?? 5), 2, 12);
  const hoursEach = clamp(Math.round(input.hoursEach ?? 4), 1, 40);

  const provider = await getAIProviderForTenant(tenantId);
  const fromAi = await callAiForSubtasks(description, count, hoursEach, provider);
  if (fromAi && fromAi.length > 0) {
    return { subtasks: fromAi, source: provider.name };
  }

  const reason = !provider.isConfigured()
    ? `${provider.name} is not configured`
    : (lastAiError || `${provider.name} call failed`);

  return {
    subtasks: heuristicSubtasks(description, count, hoursEach),
    source: "mock",
    fallbackReason: reason,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
