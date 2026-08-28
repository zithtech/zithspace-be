// src/modules/yapiez/services/payloadBuilder.ts
//
// Draft a request payload for one API definition, in one of the four shapes QA
// tests with. This is what the "Advanced" section of the New Module Test Case
// drawer calls before the tester confirms and saves.
//
// The four types, and what makes them different — the distinction matters more
// than the values, because a tester who cannot tell a Negative from an Invalid
// cannot tell a 422 from a 404 either:
//
//   Positive  every field populated with a realistic value; the happy path.
//   Valid     the MINIMUM the contract accepts — required fields only, at
//             their smallest legal values. Proves nothing optional is secretly
//             required.
//   Negative  well-formed and would deserialise, but breaks a business rule:
//             an id that does not exist, a quantity of -1, an end before a
//             start. The server should reject it with intent (404/409/422).
//   Invalid   malformed against the contract itself: wrong types, a required
//             key missing, a mangled email. Should not reach business logic.
//
// Two generators, in this order:
//   1. the tenant's AI provider, which can read field NAMES and produce values
//      that mean something ("SKU-00417", not "string");
//   2. a structural fallback derived from the definition's own sample body and
//      parameter tables, used when AI is unconfigured or returns nonsense.
// The fallback is not a degraded mode anyone has to opt into — the endpoint
// always answers, and reports which generator produced the result so the UI
// can say so.

import { getAIProviderForTenant } from '@/services/ai/resolver';
import { ApiDto } from '../repositories/mappers';
import { KeyValueEntry } from '../types';

export type PayloadType = 'Positive' | 'Negative' | 'Valid' | 'Invalid';

export interface BuiltPayload {
  /** { body?, query?, pathParams? } — only the parts the method actually uses. */
  payload: Record<string, unknown>;
  /** The status this payload should provoke. */
  expectedStatus: number | null;
  /** One line on why it is shaped this way, for the tester reading it later. */
  notes: string;
  /** ai | structure */
  generatedBy: string;
}

/** The status each type should provoke, before the API's own answer is known. */
const DEFAULT_STATUS: Record<PayloadType, number> = {
  Positive: 200,
  Valid: 200,
  Negative: 409,
  Invalid: 400,
};

const TYPE_BRIEF: Record<PayloadType, string> = {
  Positive:
    'A complete happy-path request. Every field the endpoint accepts is present with a realistic, production-shaped value. It must succeed.',
  Valid:
    'The MINIMUM request the contract accepts: required fields only, each at its smallest legal value, every optional field omitted. It must succeed.',
  Negative:
    'Well-formed and correctly typed, but it breaks a business rule — an id that does not exist, a quantity below zero, an end date before its start, a duplicate of something unique. It must be rejected by business logic, not by the parser.',
  Invalid:
    'Malformed against the contract itself — wrong types, a required field missing, a mangled email or date. It must fail validation before any business logic runs.',
};

/** An id that parses as a uuid but will never resolve to a row. */
const ABSENT_UUID = '00000000-0000-0000-0000-000000000000';

const enabledEntries = (entries: KeyValueEntry[] | undefined): KeyValueEntry[] =>
  (entries ?? []).filter((e) => e && e.key && e.enabled !== false);

/** Body shapes that carry no request body at all. */
const hasBody = (api: ApiDto): boolean =>
  api.bodyType !== 'none' && !['GET', 'HEAD'].includes(String(api.method).toUpperCase());

/**
 * The definition's own example of its body, if it has one.
 *
 * `requestBody` is the authored draft and wins; `sampleData` is the fallback a
 * definition gets from an import. Either can be absent, and a body the author
 * left as a template ({{var}} placeholders and all) will not parse — that is
 * not an error, it just means there is no structure to work from.
 */
function templateBody(api: ApiDto): Record<string, unknown> | null {
  const raw = String(api.requestBody ?? '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // A templated or non-JSON body — fall through to sampleData.
    }
  }
  const sample = api.sampleData;
  if (sample && typeof sample === 'object' && Object.keys(sample).length) {
    return sample as Record<string, unknown>;
  }
  return null;
}

// ─── Structural fallback ────────────────────────────────────────────────────

/**
 * Split a field name into words: `projectManagerId` and `project_manager_id`
 * both become [project, manager, id].
 *
 * Whole words, not substrings. Matching `kindOf`'s keywords against the raw
 * string reads "age" inside "Manager" and "manager" inside "management", which
 * turned `projectManagerId` into a number field.
 */
function tokensOf(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** Guess what a field holds from its name — the only signal a key gives us. */
function kindOf(key: string): string {
  const t = tokensOf(key);
  const has = (...words: string[]) => words.some((w) => t.includes(w));

  // Ordered by how strongly the word implies the kind. `id` is checked before
  // the generic ones so `projectManagerId` reads as an id, not a manager.
  if (has('email', 'mail', 'emails')) return 'email';
  if (has('phone', 'mobile', 'msisdn') || (has('contact') && has('no', 'number'))) return 'phone';
  if (has('password', 'passwd', 'pwd', 'secret', 'token')) return 'password';
  if (has('url', 'uri', 'link', 'website', 'href')) return 'url';
  if (has('id', 'ids', 'uuid', 'guid')) return 'id';
  if (has('date', 'dates', 'at', 'time', 'timestamp', 'dob', 'expiry', 'expires')) return 'date';
  if (has('count', 'qty', 'quantity', 'amount', 'price', 'total', 'age', 'limit',
          'offset', 'page', 'size', 'score', 'number', 'num', 'index', 'rank',
          'weight', 'height', 'duration', 'percent')) return 'number';
  if (has('is', 'has', 'can', 'enabled', 'disabled', 'active', 'flag')) return 'boolean';
  if (has('status', 'state', 'type', 'role', 'kind', 'category', 'priority', 'severity')) return 'enum';
  return 'text';
}

/**
 * Kinds whose legal values are decided by the server, not by us.
 *
 * A "minimum legal value" for an enum, an id, a date or a boolean cannot be
 * synthesised — inventing `"active"` for a priority field produces a Valid
 * payload that fails for the wrong reason. Where the definition already shows
 * a real value, Valid keeps it and shrinks only the free-form fields.
 */
const CONSTRAINED_KINDS = new Set(['enum', 'id', 'date', 'boolean']);

/** A plausible value of the given kind, at the strength the type calls for. */
function valueFor(key: string, type: PayloadType): unknown {
  const kind = kindOf(key);
  const minimal = type === 'Valid';

  switch (kind) {
    case 'email':
      if (type === 'Invalid') return 'not-an-email';
      if (type === 'Negative') return 'nobody.at.all@example.invalid';
      return minimal ? 'qa@example.com' : 'qa.automation+positive@example.com';
    case 'phone':
      if (type === 'Invalid') return 12345;
      if (type === 'Negative') return '+1000000000000000';
      return minimal ? '+10000000000' : '+14155550123';
    case 'password':
      if (type === 'Invalid') return null;
      if (type === 'Negative') return 'a';
      return minimal ? 'Passw0rd!' : 'Qa-Automation-2024!';
    case 'url':
      if (type === 'Invalid') return 'http:// broken url';
      if (type === 'Negative') return 'https://this-host-does-not-resolve.invalid/path';
      return 'https://example.com/qa';
    case 'id':
      if (type === 'Invalid') return 'not-a-valid-id';
      if (type === 'Negative') return ABSENT_UUID;
      return '11111111-1111-4111-8111-111111111111';
    case 'date':
      if (type === 'Invalid') return '31-13-2024';
      if (type === 'Negative') return '1900-01-01T00:00:00.000Z';
      return '2024-01-15T10:30:00.000Z';
    case 'number':
      if (type === 'Invalid') return 'twelve';
      if (type === 'Negative') return -1;
      return minimal ? 1 : 25;
    case 'boolean':
      if (type === 'Invalid') return 'yes';
      return type === 'Negative' ? false : true;
    case 'enum':
      if (type === 'Invalid') return 42;
      if (type === 'Negative') return 'NOT_A_REAL_STATUS';
      return 'active';
    default:
      if (type === 'Invalid') return { unexpected: 'object where a string belongs' };
      if (type === 'Negative') return '';
      return minimal ? 'QA' : `QA ${key.replace(/[_-]+/g, ' ').trim()} value`;
  }
}

/**
 * Re-shape a template value into the requested type.
 *
 * The template's own value is the best possible Positive — it is what the
 * author wrote down — so it is kept whenever it looks real. Everything else is
 * derived from the key name.
 */
function reshape(key: string, sample: unknown, type: PayloadType): unknown {
  if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(sample as Record<string, unknown>)) {
      out[k] = reshape(k, v, type);
    }
    return out;
  }
  if (Array.isArray(sample)) {
    // An empty array is its own negative case; one element is enough for the rest.
    if (type === 'Negative') return [];
    if (type === 'Invalid') return 'should have been a list';
    return sample.length ? [reshape(key, sample[0], type)] : [];
  }

  const isPlaceholder =
    typeof sample === 'string' && (/\{\{.*\}\}/.test(sample) || !sample.trim());
  const usable = sample !== null && sample !== undefined && !isPlaceholder;

  if (type === 'Positive' && usable) return sample;
  if (type === 'Valid' && usable && CONSTRAINED_KINDS.has(kindOf(key))) return sample;
  return valueFor(key, type);
}

/** Build from the definition alone — no model involved. */
function buildStructurally(api: ApiDto, type: PayloadType): BuiltPayload {
  const payload: Record<string, unknown> = {};

  if (hasBody(api)) {
    const template = templateBody(api);
    let body: Record<string, unknown>;

    if (template) {
      body = reshape('body', template, type) as Record<string, unknown>;
      const keys = Object.keys(body);
      if (type === 'Invalid' && keys.length > 1) {
        // Drop the first field outright — a missing required key is the most
        // common validation failure there is, and the likeliest one to be
        // handled badly.
        delete body[keys[0]];
        body.unexpectedField = 'this key is not in the contract';
      }
      if (type === 'Valid') {
        // Nothing to trim reliably without a required-flag on body fields, so
        // the minimum is expressed through the values, not the key set.
      }
    } else {
      // No sample to work from: say so in the body rather than inventing an
      // object shape the endpoint has never seen.
      body =
        type === 'Invalid'
          ? { '': null }
          : { note: 'This API has no sample body — fill in the fields it expects.' };
    }
    payload.body = body;
  }

  const query = enabledEntries(api.queryParams);
  if (query.length) {
    const picked = type === 'Valid' ? query.filter((q) => q.required) : query;
    const out: Record<string, unknown> = {};
    for (const q of picked.length ? picked : query) {
      out[q.key] = q.value && !/\{\{.*\}\}/.test(q.value) && type === 'Positive'
        ? q.value
        : valueFor(q.key, type);
    }
    payload.query = out;
  }

  const path = enabledEntries(api.pathParams);
  if (path.length) {
    const out: Record<string, unknown> = {};
    for (const p of path) {
      // A path param is never optional — the URL does not resolve without it.
      out[p.key] = p.value && !/\{\{.*\}\}/.test(p.value) && type === 'Positive'
        ? p.value
        : valueFor(p.key, type);
    }
    payload.pathParams = out;
  }

  if (!Object.keys(payload).length) {
    payload.body = {};
  }

  const NOTES: Record<PayloadType, string> = {
    Positive: 'Happy path — every field populated from the definition’s sample body.',
    Valid: 'Minimum accepted request — required parameters only, at their smallest legal values.',
    Negative: 'Correctly typed but breaks a business rule: absent ids, negative amounts, empty required text.',
    Invalid: 'Malformed against the contract: wrong types, a required field removed, an unexpected key added.',
  };

  return {
    payload,
    expectedStatus:
      type === 'Positive' || type === 'Valid'
        ? api.expectedStatus ?? DEFAULT_STATUS[type]
        : DEFAULT_STATUS[type],
    notes: NOTES[type],
    generatedBy: 'structure',
  };
}

// ─── AI generator ───────────────────────────────────────────────────────────

/** Salvage the object from a model that wrapped it in prose or fences. */
function parseLoose(text: string): any | null {
  const cleaned = String(text ?? '')
    .replace(/^```[a-zA-Z]*\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function describeParams(label: string, entries: KeyValueEntry[] | undefined): string {
  const list = enabledEntries(entries);
  if (!list.length) return '';
  const lines = list
    .map((e) => `  - ${e.key}${e.required ? ' (required)' : ''}${e.value ? ` e.g. ${e.value}` : ''}`)
    .join('\n');
  return `${label}:\n${lines}\n`;
}

async function buildWithAi(
  tenantId: string,
  api: ApiDto,
  type: PayloadType,
  hint?: string | null
): Promise<BuiltPayload | null> {
  const provider = await getAIProviderForTenant(tenantId);
  if (!provider || !provider.isConfigured()) return null;

  const template = templateBody(api);
  const parts = [
    `Endpoint: ${api.method} ${api.url}`,
    api.description ? `What it does: ${api.description}` : '',
    api.moduleName ? `Module: ${api.moduleName}` : '',
    `Body type: ${api.bodyType}`,
    template ? `Sample request body:\n${JSON.stringify(template, null, 2)}` : 'Sample request body: none recorded.',
    describeParams('Query parameters', api.queryParams),
    describeParams('Path parameters', api.pathParams),
    api.expectedStatus ? `Documented success status: ${api.expectedStatus}` : '',
    hint ? `The tester also asked for: ${hint}` : '',
  ].filter(Boolean);

  const prompt = `
You are a senior QA engineer writing request payloads for an API test case.

${parts.join('\n')}

Write ONE "${type}" payload.
${type}: ${TYPE_BRIEF[type]}

Rules:
- Keep exactly the field names the sample body and parameter lists use. Do not
  rename, translate or "tidy" a key, and do not invent fields the endpoint has
  never been shown to accept${type === 'Invalid' ? ' — except for the single unexpected key an Invalid payload may carry to prove it is rejected.' : '.'}
- Use values a reader recognises as real: a name that looks like a name, an id
  that looks like this API's ids. Never write "string", "value" or "example".
- Never include real credentials, real customer data, or a working API key.
${hasBody(api) ? '- Include "body".' : '- This method sends no body: omit "body".'}
${enabledEntries(api.queryParams).length ? '- Include "query".' : '- Omit "query".'}
${enabledEntries(api.pathParams).length ? '- Include "pathParams".' : '- Omit "pathParams".'}

Return ONLY this JSON object, with no markdown fences and no commentary:
{
  "payload": { "body": {}, "query": {}, "pathParams": {} },
  "expectedStatus": 200,
  "notes": "one sentence on what this payload proves and why the server should answer that way"
}
`.trim();

  const raw = await provider.generateText(prompt, { temperature: 0.4, maxOutputTokens: 2048 });
  const parsed = parseLoose(raw?.text || '');

  const body = parsed?.payload;
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length) {
    return null;
  }

  const status = Number(parsed.expectedStatus);
  return {
    payload: body as Record<string, unknown>,
    expectedStatus:
      Number.isInteger(status) && status >= 100 && status <= 599 ? status : DEFAULT_STATUS[type],
    notes: String(parsed.notes ?? '').slice(0, 2000) || TYPE_BRIEF[type],
    generatedBy: 'ai',
  };
}

/**
 * Draft a payload of `type` for `api`.
 *
 * Never throws for want of AI: a tenant with no provider configured, or a model
 * that answers with prose, falls through to the structural build. The caller
 * reads `generatedBy` to tell the tester which one they are looking at.
 */
export async function buildPayload(
  tenantId: string,
  api: ApiDto,
  type: PayloadType,
  hint?: string | null
): Promise<BuiltPayload> {
  try {
    const drafted = await buildWithAi(tenantId, api, type, hint);
    if (drafted) return drafted;
  } catch (err) {
    // A provider outage is not a reason to leave the tester with nothing.
    console.error('[yapiez] AI payload draft failed, using structural build:', err);
  }
  return buildStructurally(api, type);
}
