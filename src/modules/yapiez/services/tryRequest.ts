// src/modules/yapiez/services/tryRequest.ts
//
// "Send" from the API definition editor — execute a draft once and hand back
// the real response, so the author can capture the expected status and sample
// payload instead of typing them from memory.
//
// Two things make this different from the flow runner:
//   1. It works on an UNSAVED draft. The author is mid-definition; requiring a
//      save first would mean writing a half-finished definition to the catalog
//      just to see what the endpoint returns.
//   2. It persists nothing. No run row, no run steps — this is a lookup, not
//      QA evidence, and putting it in the run history would pollute the record
//      QA Space reports on.
//
// It goes through the same buildRequest/execute path as a real step, so what
// you see here is what a flow will send, SSRF guard and all.

import { ApiDto } from '../repositories/mappers';
import { EnvironmentDto } from '../repositories/mappers';
import { AuthType, BodyType, HttpMethod, KeyValueEntry, YapiezError } from '../types';
import { AuthHeader, buildRequest } from './requestBuilder';
import { readPath, VariableContext } from './template';
import { execute } from './transport';

/** The draft the editor sends — a definition that may never have been saved. */
export interface TryDefinition {
  method: HttpMethod;
  url: string;
  headers?: KeyValueEntry[];
  queryParams?: KeyValueEntry[];
  pathParams?: KeyValueEntry[];
  bodyType?: BodyType;
  requestBody?: string | null;
  authType?: AuthType;
  authConfig?: Record<string, any>;
  timeoutMs?: number | null;
}

export interface TryResult {
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string | null;
  };
  response: {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
    size: number;
    durationMs: number;
  } | null;
  /** Set when the call never produced an HTTP response (DNS, timeout, refused). */
  error?: string;
  /** Variables referenced but never set — the usual cause of a confusing 404. */
  unresolvedVariables: string[];
  /** How authentication was resolved, so the UI can explain a 401. */
  auth: {
    applied: boolean;
    via: 'none' | 'login' | 'definition';
    error?: string;
  };
}

/** Turn a draft into the ApiDto shape buildRequest expects. */
function asApiDto(draft: TryDefinition): ApiDto {
  return {
    id: '',
    collectionId: null,
    // A draft belongs to no project — nothing here is filed anywhere, and the
    // request is built from the draft alone.
    projectId: null,
    name: 'Draft',
    description: null,
    method: draft.method,
    url: draft.url,
    headers: draft.headers ?? [],
    queryParams: draft.queryParams ?? [],
    pathParams: draft.pathParams ?? [],
    bodyType: draft.bodyType ?? 'none',
    requestBody: draft.requestBody ?? null,
    sampleData: {},
    authType: draft.authType ?? 'inherit',
    authConfig: draft.authConfig ?? {},
    expectedStatus: null,
    expectedResponse: null,
    responseSchema: {},
    defaultAssertions: [],
    timeoutMs: draft.timeoutMs ?? null,
    tags: [],
    ownerId: null,
    notes: null,
    isDeprecated: false,
    createdAt: '',
    updatedAt: '',
  };
}

/** Authorization / cookie values are never echoed back to the browser. */
function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = /authorization|cookie|api-key|x-api-key|token/i.test(key) ? '••••••••' : value;
  }
  return out;
}

/**
 * Run a login API and turn its response into a header, for trying an endpoint
 * that sits behind authentication.
 *
 * Deliberately duplicates a little of flowRunner's auth step rather than
 * reaching into it: that function's job is to persist a run step, and bending
 * it to also serve a non-persisting preview would complicate the one path QA's
 * results actually depend on.
 */
async function loginFor(
  authApi: ApiDto,
  config: Record<string, any>,
  environment: EnvironmentDto | null,
  context: VariableContext
): Promise<{ header: AuthHeader | null; error?: string }> {
  const tokenPath = config.tokenPath || 'access_token';
  const variableName = config.variableName || 'accessToken';
  const headerName = config.headerName || 'Authorization';
  const scheme = config.scheme === undefined ? 'Bearer' : config.scheme;

  const request = buildRequest({
    api: authApi,
    overrides: config.body ? { body: config.body } : {},
    baseUrl: environment?.baseUrl ?? null,
    context,
    authHeader: null,
  });

  const result = await execute(request);
  if (result.error) return { header: null, error: `Login request failed: ${result.error}` };
  if (result.response.statusCode >= 400) {
    return { header: null, error: `Login returned ${result.response.statusCode}.` };
  }

  const token = readPath(result.response.body, tokenPath);
  if (token === undefined || token === null || String(token).length === 0) {
    return {
      header: null,
      error: `Login succeeded but no value was found at "${tokenPath}" in its response.`,
    };
  }

  // Make the token available to the draft as a variable too, so a definition
  // that writes {{accessToken}} into a header by hand also resolves.
  context[variableName] = token;

  return { header: { name: headerName, value: scheme ? `${scheme} ${token}` : String(token) } };
}

export async function tryRequest(input: {
  draft: TryDefinition;
  environment: EnvironmentDto | null;
  variables?: Record<string, string>;
  authApi?: ApiDto | null;
  authConfig?: Record<string, any>;
}): Promise<TryResult> {
  const { draft, environment, variables, authApi, authConfig } = input;

  if (!draft.url?.trim()) {
    throw YapiezError.badRequest('Give the API a URL before sending it.');
  }

  // Same seeding as a run: environment first, then per-send overrides.
  const context: VariableContext = {};
  if (environment) {
    context.baseUrl = environment.baseUrl;
    for (const variable of environment.variables) context[variable.key] = variable.value;
  }
  for (const [key, value] of Object.entries(variables ?? {})) context[key] = value;

  let authHeader: AuthHeader | null = null;
  const auth: TryResult['auth'] = { applied: false, via: 'none' };

  if (authApi) {
    const login = await loginFor(authApi, authConfig ?? {}, environment, context);
    authHeader = login.header;
    auth.via = 'login';
    auth.applied = !!login.header;
    auth.error = login.error;
  } else if (draft.authType && draft.authType !== 'inherit' && draft.authType !== 'none') {
    // buildRequest applies these from the definition itself.
    auth.via = 'definition';
    auth.applied = true;
  }

  const request = buildRequest({
    api: asApiDto(draft),
    baseUrl: environment?.baseUrl ?? null,
    context,
    authHeader,
  });

  const result = await execute(request);

  return {
    request: {
      method: request.method,
      url: result.finalUrl,
      headers: redactHeaders(request.headers),
      body: request.body ?? null,
    },
    response: result.error
      ? null
      : {
          statusCode: result.response.statusCode,
          headers: result.response.headers,
          body: result.response.rawBody,
          size: result.response.byteSize,
          durationMs: result.response.durationMs,
        },
    error: result.error,
    unresolvedVariables: request.missingVariables,
    auth,
  };
}
