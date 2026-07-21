import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIResponse } from "../ai/interfaces/AIResponse";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const MODEL = "gemini-flash-latest";

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:html|HTML)?\s*\n?/, "")
    .replace(/```\s*$/, "")
    .trim();
}

export class MailAiService {
  /**
   * Rewrite the email body with more detail, better structure, and
   * a polished professional tone. Preserves HTML structure.
   */
  static async enhanceContent(params: {
    subject?: string;
    body: string;
    context?: string;
  }): Promise<AIResponse<string>> {
    const body = (params.body || "").trim();
    if (!body) return { data: "", provider: "gemini", model: MODEL, usage: { promptTokens: 0, completionTokens: 0 }, metadata: {} };

    const model = genAI.getGenerativeModel({ model: MODEL });
    const prompt = `
You are an expert business writing assistant helping a sales/account manager
rewrite a client-facing email so it reads as more thoughtful, detailed, and persuasive.

Goals:
- Expand the message with helpful detail and a clearer value proposition.
- Keep a warm, professional tone — not pushy, not robotic.
- Preserve the existing greeting and sign-off (names, salutation).
- Keep paragraphs scannable. Use short paragraphs. You may use <ul><li> bullets if helpful.
- Do NOT invent facts (no fake stats, no made-up dates, no fictional features).
- Do NOT add placeholders like [Your Name] or [Company].
- Output VALID HTML only, using the same tag vocabulary as the input
  (<p>, <br>, <strong>, <em>, <ul>, <li>, <ol>, <a>). No <html>/<body> wrapper, no markdown, no code fences.

${params.subject ? `Subject: ${params.subject}` : ""}
${params.context ? `Context: ${params.context}` : ""}

Original email HTML:
${body}

Return ONLY the rewritten HTML.
`.trim();

    const result = await model.generateContent(prompt);
    const raw = result.response.text() || "";
    const cleaned = stripCodeFences(raw);
    
    const usageMetadata = result.response.usageMetadata || { promptTokenCount: 0, candidatesTokenCount: 0 };
    return {
        data: cleaned || body,
        provider: "gemini",
        model: MODEL,
        usage: {
            promptTokens: usageMetadata.promptTokenCount || 0,
            completionTokens: usageMetadata.candidatesTokenCount || 0
        },
        metadata: {}
    };
  }

  /**
   * Light-touch grammar/spelling correction. Preserves HTML structure
   * and the author's voice — no rewriting, no expansion.
   */
  static async correctGrammar(body: string): Promise<AIResponse<string>> {
    const input = (body || "").trim();
    if (!input) return { data: "", provider: "gemini", model: MODEL, usage: { promptTokens: 0, completionTokens: 0 }, metadata: {} };

    const model = genAI.getGenerativeModel({ model: MODEL });
    const prompt = `
You are a light-touch copy editor. Make ONLY minimal changes to the HTML email below:
- Fix spelling, grammar, punctuation, capitalisation, and obvious typos.
- Preserve the author's voice, tone, sentence structure, and word choices wherever possible.
- Preserve ALL HTML tags exactly as they appear. Do not add, remove, or restructure tags.
- Do NOT rewrite, summarise, expand, translate, or add new content.
- Do NOT add a preamble, explanation, markdown, or code fences.

Original email HTML:
${input}

Return ONLY the corrected HTML.
`.trim();

    const result = await model.generateContent(prompt);
    const raw = result.response.text() || "";
    const cleaned = stripCodeFences(raw);

    const usageMetadata = result.response.usageMetadata || { promptTokenCount: 0, candidatesTokenCount: 0 };
    return {
        data: cleaned || input,
        provider: "gemini",
        model: MODEL,
        usage: {
            promptTokens: usageMetadata.promptTokenCount || 0,
            completionTokens: usageMetadata.candidatesTokenCount || 0
        },
        metadata: {}
    };
  }
}
