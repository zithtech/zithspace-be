// src/modules/yapiez/types/index.ts
// Shared domain types + module error class for Yapiez.

/** The acting principal for a write, derived from the authenticated request. */
export interface Actor {
  tenantId: string;
  userId: string;
}

/** A typed, HTTP-aware error the controller layer maps to a JSON response. */
export class YapiezError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'YapiezError';
  }

  static notFound(resource: string): YapiezError {
    return new YapiezError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static badRequest(message: string): YapiezError {
    return new YapiezError(400, 'BAD_REQUEST', message);
  }

  static conflict(message: string): YapiezError {
    return new YapiezError(409, 'CONFLICT', message);
  }

  static forbidden(message: string): YapiezError {
    return new YapiezError(403, 'FORBIDDEN', message);
  }
}

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export const BODY_TYPES = ['none', 'json', 'form', 'text'] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export const AUTH_TYPES = ['inherit', 'none', 'bearer', 'basic', 'api_key'] as const;
export type AuthType = (typeof AUTH_TYPES)[number];

/**
 * One row in an API's header / query / path table.
 *
 * `enabled: false` keeps a documented-but-unsent entry visible in the UI, which
 * is how a developer records an optional header without forcing it on QA.
 */
export interface KeyValueEntry {
  key: string;
  value: string;
  description?: string;
  enabled?: boolean;
  required?: boolean;
  secret?: boolean;
}

/** A variable defined on an environment. Secret values never leave the server. */
export interface EnvVariable {
  key: string;
  value: string;
  secret?: boolean;
}

// ─── Assertions ─────────────────────────────────────────────────────────────

export const ASSERTION_SOURCES = ['status', 'body', 'header', 'responseTime'] as const;
export type AssertionSource = (typeof ASSERTION_SOURCES)[number];

export const ASSERTION_OPERATORS = [
  'equals',
  'notEquals',
  'exists',
  'notExists',
  'contains',
  'notContains',
  'matches',
  'greaterThan',
  'lessThan',
  'isNumber',
  'isString',
  'isBoolean',
  'isArray',
  'isEmpty',
  'isNotEmpty',
] as const;
export type AssertionOperator = (typeof ASSERTION_OPERATORS)[number];

/**
 * One validation QA attaches to a step.
 *
 * `path` is a dotted path into the response body (`user.id`, `items.0.name`)
 * for source 'body', or a header name for source 'header'. It is ignored for
 * 'status' and 'responseTime'.
 *
 * `expected` may itself contain {{variables}} — that is what makes
 * "user.email should match the email we sent" expressible.
 */
export interface Assertion {
  id?: string;
  name?: string;
  source: AssertionSource;
  path?: string;
  operator: AssertionOperator;
  expected?: string;
}

export interface AssertionResult {
  name: string;
  source: AssertionSource;
  path?: string;
  operator: AssertionOperator;
  expected?: string;
  actual?: string;
  passed: boolean;
  message: string;
}

// ─── Extractions ────────────────────────────────────────────────────────────

export const EXTRACTION_SOURCES = ['body', 'header', 'status'] as const;
export type ExtractionSource = (typeof EXTRACTION_SOURCES)[number];

/**
 * "Store this piece of the response under this variable name."
 *
 * This is the mechanism behind Create User → {{userId}} → Get/Update/Delete.
 */
export interface Extraction {
  variable: string;
  source: ExtractionSource;
  path?: string;
  /** Fail the step when the path yields nothing, instead of storing undefined. */
  required?: boolean;
}

// ─── Per-step overrides ─────────────────────────────────────────────────────

/**
 * What a step may change about the API definition it points at, without
 * editing the shared definition. Anything omitted falls through to the API.
 */
export interface StepOverrides {
  url?: string;
  headers?: KeyValueEntry[];
  queryParams?: KeyValueEntry[];
  pathParams?: KeyValueEntry[];
  body?: string;
  bodyType?: BodyType;
  timeoutMs?: number;
  /** Suppress the flow's Authorization header for this one step. */
  skipAuth?: boolean;
}

// ─── Flow authentication ────────────────────────────────────────────────────

/**
 * How a flow turns its login API's response into a header on every later call.
 * Defaults live in services/auth.ts; anything unset there uses them.
 */
export interface FlowAuthConfig {
  /** Dotted path to the token in the login response. Default 'access_token'. */
  tokenPath?: string;
  /** Variable the token is stored under. Default 'accessToken'. */
  variableName?: string;
  /** Header the token is attached to. Default 'Authorization'. */
  headerName?: string;
  /** Prefix before the token. Default 'Bearer'. Empty string sends it raw. */
  scheme?: string;
  /** Body overrides for the login call (e.g. {{username}} / {{password}}). */
  body?: string;
  /** Skip authentication entirely for this run. */
  disabled?: boolean;
}

export type RunStatus = 'Running' | 'Passed' | 'Failed' | 'Aborted';
export type StepStatus = 'Pass' | 'Fail' | 'Skipped';
