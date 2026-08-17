import { getAIProviderForTenant } from "./ai/resolver";
import { AIResponse } from "../ai/interfaces/AIResponse";
import dotenv from "dotenv";

dotenv.config();

export interface RawBug {
  id: string;
  description: string;
  module?: string | null;
  severity?: string | null;
  bugType?: string | null;
}

export interface AiReviewResult {
  bugId: string;
  cleanedDescription: string;
  suggestedTitle: string;
  stepsToReproduce: string[];
  expectedBehavior: string;
  actualBehavior: string;
  missingDetails: string[];
}

export interface AiGroupSuggestion {
  groupKey: string;
  title: string;
  module?: string;
  reason: string;
  bugIds: string[];
}

function extractJson<T>(text: string): T | null {
  // Strip markdown fences and pull the first JSON value found.
  const stripped = text.replace(/```(?:json)?/g, "").trim();
  const match = stripped.match(/[\{\[][\s\S]*[\}\]]/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

export class BugListAiService {
  static async review(bugs: RawBug[], tenantId?: string): Promise<AIResponse<AiReviewResult[]>> {
    if (bugs.length === 0) return { data: [], provider: "mock", model: "mock", usage: { promptTokens: 0, completionTokens: 0 }, metadata: {} };
    const prompt = `
You are a senior QA lead. Clean and structure each raw bug below.
Return ONLY a JSON array. One object per input bug, in the same order.

Each object MUST have:
{
  "bugId": "string (echo the input id)",
  "cleanedDescription": "polished description",
  "suggestedTitle": "concise title (max 80 chars)",
  "stepsToReproduce": ["step 1", "step 2", ...],
  "expectedBehavior": "string",
  "actualBehavior": "string",
  "missingDetails": ["what info is missing", ...]
}

Bugs:
${JSON.stringify(
  bugs.map((b) => ({
    id: b.id,
    description: b.description,
    module: b.module || null,
    severity: b.severity || null,
    bugType: b.bugType || null,
  })),
  null,
  2,
)}
`.trim();

    const provider = await getAIProviderForTenant(tenantId);
    const res = await provider.generateText(prompt);
    const parsed = extractJson<AiReviewResult[]>(res.text);
    if (!Array.isArray(parsed)) {
      throw new Error("AI returned an unexpected shape for review");
    }

    return {
        data: parsed,
        provider: provider.name,
        model: res.model,
        usage: res.usage,
        metadata: {}
    };
  }

  static async enhanceText(text: string, tenantId?: string): Promise<AIResponse<string>> {
    const input = (text || "").trim();
    if (!input) return { data: "", provider: "mock", model: "mock", usage: { promptTokens: 0, completionTokens: 0 }, metadata: {} };
    const prompt = `
You are a light-touch copy editor. Make ONLY minimal changes to the text below:
- Fix spelling, grammar, punctuation, capitalisation, and obvious typos.
- Preserve the author's voice, tone, structure, line breaks, and technical terms.
- Do NOT rewrite, summarise, expand, translate, or add anything new.
- Do NOT wrap in quotes or markdown. Do NOT add a preamble or explanation.
Return ONLY the corrected text as plain text.

Text:
${input}
`.trim();

    const provider = await getAIProviderForTenant(tenantId);
    const res = await provider.generateText(prompt);
    const out = (res.text || "").trim();
    const data = out
      .replace(/^```[a-zA-Z]*\n?/, "")
      .replace(/```$/, "")
      .trim() || input;
      
    return {
        data,
        provider: provider.name,
        model: res.model,
        usage: res.usage,
        metadata: {}
    };
  }

  static async suggestGroups(bugs: RawBug[], tenantId?: string): Promise<AIResponse<AiGroupSuggestion[]>> {
    if (bugs.length === 0) return { data: [], provider: "mock", model: "mock", usage: { promptTokens: 0, completionTokens: 0 }, metadata: {} };
    const prompt = `
You are a senior QA lead. Group the bugs below into logical clusters that
each map to a single developer ticket. Group by feature/module/context, NOT
just by severity or type. A cluster may contain a single bug if it is unique.

Return ONLY a JSON array. Each object MUST have:
{
  "groupKey": "stable slug like 'auth-flow' (lowercase, dash-separated)",
  "title": "ticket title for the cluster",
  "module": "primary module if obvious, else omit",
  "reason": "1 sentence explaining why these bugs belong together",
  "bugIds": ["...","..."]
}

Cover every input bugId exactly once across the groups.

Bugs:
${JSON.stringify(
  bugs.map((b) => ({
    id: b.id,
    description: b.description,
    module: b.module || null,
    severity: b.severity || null,
    bugType: b.bugType || null,
  })),
  null,
  2,
)}
`.trim();

    const provider = await getAIProviderForTenant(tenantId);
    const res = await provider.generateText(prompt);
    const parsed = extractJson<AiGroupSuggestion[]>(res.text);
    if (!Array.isArray(parsed)) {
      throw new Error("AI returned an unexpected shape for grouping");
    }
    
    return {
        data: parsed,
        provider: provider.name,
        model: res.model,
        usage: res.usage,
        metadata: {}
    };
  }
}
