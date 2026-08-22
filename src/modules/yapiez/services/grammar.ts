// src/modules/yapiez/services/grammar.ts
//
// Light-touch copy editing for the free-text an API definition carries.
//
// The prompt mirrors the QA Submission grammar pass deliberately — the same
// editorial promise (fix mistakes, change nothing else) should behave the same
// wherever it appears in the product. It is duplicated rather than imported
// because that controller's version is bound to submission auth and response
// shapes; the shared part is a dozen lines of prompt, not a module.

import { getAIProviderForTenant } from '@/services/ai/resolver';
import { YapiezError } from '../types';

const MAX_INPUT = 8000;

export async function correctGrammar(tenantId: string, text: string): Promise<string> {
  const input = String(text ?? '').trim();
  if (!input) throw YapiezError.badRequest('There is nothing to correct yet.');
  if (input.length > MAX_INPUT) {
    throw YapiezError.badRequest(`Text is too long (max ${MAX_INPUT} characters).`);
  }

  const provider = await getAIProviderForTenant(tenantId);
  if (!provider || !provider.isConfigured()) {
    throw YapiezError.badRequest(
      'AI is not configured for this tenant. Add an API key in Settings → AI, or edit the text by hand.'
    );
  }

  // An API description is dense with terms that look like typos to a model —
  // endpoint paths, {{variables}}, header names, casing that matters. The
  // prompt names them so a "correction" cannot quietly break a definition.
  const prompt = `
You are a light-touch copy editor for API documentation. Make ONLY minimal changes:
- Fix spelling, grammar, punctuation, capitalisation, and obvious typos.
- Preserve the author's voice and tone.
- NEVER alter these, even if they look wrong: URLs and endpoint paths, {{variable}}
  placeholders, header names, JSON keys, HTTP method names, status codes, code
  identifiers, and anything inside backticks.
- Do NOT rewrite, summarise, expand, translate, or add anything new.
- Do NOT wrap in quotes or markdown. Do NOT add a preamble.
Return ONLY the corrected text.

Text:
${input}
`.trim();

  const raw = await provider.generateText(prompt, { temperature: 0.2, maxOutputTokens: 2048 });

  const corrected =
    (raw?.text || '')
      .replace(/^```[a-zA-Z]*\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim() || input;

  return corrected;
}
