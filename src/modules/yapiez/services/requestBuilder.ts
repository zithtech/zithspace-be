// src/modules/yapiez/services/requestBuilder.ts
//
// Folds an API definition, a step's overrides, the flow's auth header and the
// run's variable context into one concrete request. Kept separate from the
// runner so "what would this step actually send?" is answerable without
// executing anything — that is what the flow builder's Preview uses.

import { ApiDto } from '../repositories/mappers';
import { BodyType, KeyValueEntry, StepOverrides } from '../types';
import { render, renderMap, resolveUrl, VariableContext } from './template';
import { TransportRequest } from './transport';

/** A header/param the request should actually carry (enabled, non-empty key). */
function activeEntries(entries: KeyValueEntry[] | undefined): KeyValueEntry[] {
  return (entries ?? []).filter((e) => e && e.key && e.enabled !== false);
}

/** Later sources win, matched case-insensitively for headers. */
function mergeEntries(base: KeyValueEntry[], override: KeyValueEntry[], caseInsensitive: boolean) {
  const out = new Map<string, KeyValueEntry>();
  const keyOf = (k: string) => (caseInsensitive ? k.toLowerCase() : k);
  for (const entry of base) out.set(keyOf(entry.key), entry);
  for (const entry of override) out.set(keyOf(entry.key), entry);
  return Array.from(out.values());
}

/**
 * Substitute :id / {id} / {{id}} path placeholders.
 *
 * All three spellings are accepted because developers paste URLs from whatever
 * their framework prints. {{id}} is left to the general renderer so it also
 * picks up run variables; the other two are resolved from path params here.
 */
function applyPathParams(
  url: string,
  params: KeyValueEntry[],
  context: VariableContext,
  missing: Set<string>
): string {
  let out = url;
  for (const param of params) {
    const value = encodeURIComponent(render(param.value, context, missing));
    out = out
      .replace(new RegExp(`:${param.key}(?=/|$|\\?)`, 'g'), value)
      .replace(new RegExp(`\\{${param.key}\\}`, 'g'), value);
  }
  return out;
}

export interface AuthHeader {
  name: string;
  value: string;
}

export interface BuiltRequest extends TransportRequest {
  /** Variables referenced but never set — surfaced on the step's error line. */
  missingVariables: string[];
}

export interface BuildInput {
  api: ApiDto;
  overrides?: StepOverrides;
  baseUrl: string | null;
  context: VariableContext;
  /** The flow-level Authorization header, already resolved from the login step. */
  authHeader?: AuthHeader | null;
}

/**
 * Build the request for one step.
 *
 * Precedence, lowest to highest: API definition → flow auth header → step
 * overrides. A step override therefore always wins, which is what makes
 * "this one call uses a different token" expressible without a second API.
 */
export function buildRequest(input: BuildInput): BuiltRequest {
  const { api, overrides = {}, baseUrl, context, authHeader } = input;
  const missing = new Set<string>();

  const headerEntries = mergeEntries(
    activeEntries(api.headers),
    activeEntries(overrides.headers),
    true
  );
  const queryEntries = mergeEntries(
    activeEntries(api.queryParams),
    activeEntries(overrides.queryParams),
    false
  );
  const pathEntries = mergeEntries(
    activeEntries(api.pathParams),
    activeEntries(overrides.pathParams),
    false
  );

  const headers: Record<string, string> = {};
  for (const entry of headerEntries) {
    headers[render(entry.key, context, missing)] = render(entry.value, context, missing);
  }

  // Auth is applied unless the API opts out, the step opts out, or the API
  // carries its own scheme — an explicit header the developer wrote always wins.
  const wantsFlowAuth =
    api.authType === 'inherit' && !overrides.skipAuth && !!authHeader;
  if (wantsFlowAuth && authHeader) {
    const alreadySet = Object.keys(headers).some(
      (h) => h.toLowerCase() === authHeader.name.toLowerCase()
    );
    if (!alreadySet) headers[authHeader.name] = authHeader.value;
  }
  applyApiOwnAuth(api, headers, context, missing);

  const query: Record<string, string> = {};
  for (const entry of queryEntries) {
    query[render(entry.key, context, missing)] = render(entry.value, context, missing);
  }

  const rawUrl = overrides.url ?? api.url;
  const withPath = applyPathParams(rawUrl, pathEntries, context, missing);
  const url = resolveUrl(baseUrl, render(withPath, context, missing));

  const bodyType = (overrides.bodyType ?? api.bodyType ?? 'none') as BodyType;
  const rawBody = overrides.body ?? api.requestBody ?? '';
  const body = bodyType === 'none' ? undefined : render(rawBody, context, missing);

  return {
    method: api.method,
    url,
    headers,
    query,
    body,
    bodyType,
    timeoutMs: overrides.timeoutMs ?? api.timeoutMs ?? undefined,
    missingVariables: Array.from(missing),
  };
}

/**
 * Auth declared on the API itself, for endpoints that do not use the flow's
 * token (a webhook signed with an API key, say).
 */
function applyApiOwnAuth(
  api: ApiDto,
  headers: Record<string, string>,
  context: VariableContext,
  missing: Set<string>
): void {
  const config = (api.authConfig ?? {}) as Record<string, string>;
  switch (api.authType) {
    case 'bearer': {
      const token = render(config.token ?? '', context, missing);
      if (token) headers['Authorization'] = `Bearer ${token}`;
      break;
    }
    case 'basic': {
      const username = render(config.username ?? '', context, missing);
      const password = render(config.password ?? '', context, missing);
      if (username || password) {
        const encoded = Buffer.from(`${username}:${password}`).toString('base64');
        headers['Authorization'] = `Basic ${encoded}`;
      }
      break;
    }
    case 'api_key': {
      const name = render(config.headerName || 'X-API-Key', context, missing);
      const value = render(config.value ?? '', context, missing);
      if (value) headers[name] = value;
      break;
    }
    default:
      break;
  }
}

/** Render a request for display without sending it (flow builder preview). */
export function previewRequest(input: BuildInput): BuiltRequest {
  return buildRequest(input);
}
