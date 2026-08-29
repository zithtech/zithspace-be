// src/modules/yapiez/services/template.ts
//
// The {{variable}} substitution layer, and the dotted-path reader that feeds
// it. Everything QA writes — URLs, header values, bodies, expected values —
// passes through `render()` with the run's variable context.

/** The live variable bag for one run: env vars, the token, extracted values. */
export type VariableContext = Record<string, unknown>;

const TOKEN_RE = /\{\{\s*([^{}\s]+)\s*\}\}/g;

/**
 * Read `user.address.city` / `items.0.id` out of a parsed response.
 *
 * Deliberately not a JSONPath implementation: numeric segments index arrays,
 * everything else is a property, and that covers what API flow testing needs
 * without teaching QA a query language.
 */
export function readPath(source: unknown, path?: string): unknown {
  if (!path) return source;
  const segments = path
    .replace(/\[(\d+)\]/g, '.$1')      // items[0].id -> items.0.id
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean);

  let current: any = source;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (typeof current !== 'object') return undefined;
    current = current[segment];
  }
  return current;
}

/** Turn a resolved value into the string that goes on the wire. */
function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Replace every {{name}} in `input` with its value from `context`.
 *
 * An unknown variable is left exactly as written rather than blanked. A request
 * that goes out with a literal `{{userId}}` in the URL fails loudly and tells
 * QA which variable never got set; a silently empty segment produces a
 * mystery 404 instead. `missing` collects those names for the run log.
 */
export function render(
  input: string | null | undefined,
  context: VariableContext,
  missing?: Set<string>
): string {
  if (!input) return input ?? '';
  return input.replace(TOKEN_RE, (whole, name: string) => {
    const value = readPath(context, name);
    if (value === undefined) {
      // A bare name that simply is not set — record it. A dotted path into a
      // set variable that resolved to undefined is recorded the same way.
      missing?.add(name);
      return whole;
    }
    return stringify(value);
  });
}

/** Render every value of a plain string map. */
export function renderMap(
  input: Record<string, string>,
  context: VariableContext,
  missing?: Set<string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    out[render(key, context, missing)] = render(value, context, missing);
  }
  return out;
}

/** Every variable name referenced by a string, whether or not it is defined. */
export function referencedVariables(input: string | null | undefined): string[] {
  if (!input) return [];
  const names: string[] = [];
  for (const match of input.matchAll(TOKEN_RE)) names.push(match[1]);
  return names;
}

/**
 * Join an environment base URL with an API's (usually relative) url.
 *
 * An absolute url on the API wins outright — that is how a flow calls a
 * third-party endpoint that has nothing to do with {{baseUrl}}.
 */
export function resolveUrl(baseUrl: string | null | undefined, url: string): string {
  const target = (url ?? '').trim();
  if (/^https?:\/\//i.test(target)) return target;
  const base = (baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!base) return target;
  if (!target) return base;
  return `${base}/${target.replace(/^\/+/, '')}`;
}

/** Values a run should never persist or echo back. */
export function maskSecrets(
  context: VariableContext,
  secretKeys: Iterable<string>
): VariableContext {
  const masked: VariableContext = { ...context };
  for (const key of secretKeys) {
    if (key in masked) masked[key] = '••••••••';
  }
  return masked;
}
