// src/modules/yapiez/repositories/mappers.ts
// snake_case rows -> camelCase DTOs. One place, so a column rename is one edit.

import { Assertion, Extraction, EnvVariable, KeyValueEntry } from '../types';

/** jsonb columns come back parsed, but a legacy text value might not be. */
function asJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export interface SourceDto {
  id: string;
  key: string;
  label: string;
  description: string | null;
  color: string | null;
  sort: number;
  isDefault: boolean;
  collectionCount?: number;
  apiCount?: number;
  createdAt: string;
  updatedAt: string;
}

export function toSource(row: any): SourceDto {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description ?? null,
    color: row.color ?? null,
    sort: Number(row.sort ?? 0),
    isDefault: !!row.is_default,
    collectionCount: row.collection_count !== undefined ? Number(row.collection_count) : undefined,
    apiCount: row.api_count !== undefined ? Number(row.api_count) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CollectionDto {
  id: string;
  name: string;
  sourceId: string | null;
  sourceLabel?: string | null;
  sourceColor?: string | null;
  description: string | null;
  projectId: string | null;
  projectName?: string | null;
  color: string | null;
  apiCount?: number;
  /** APIs by HTTP method, e.g. { GET: 4, POST: 2 }. */
  methodCounts?: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export function toCollection(row: any): CollectionDto {
  return {
    id: row.id,
    name: row.name,
    sourceId: row.source_id ?? null,
    sourceLabel: row.source_label ?? null,
    sourceColor: row.source_color ?? null,
    description: row.description ?? null,
    projectId: row.project_id ?? null,
    projectName: row.project_name ?? null,
    color: row.color ?? null,
    apiCount: row.api_count !== undefined ? Number(row.api_count) : undefined,
    methodCounts: asJson<Record<string, number>>(row.method_counts, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ApiDto {
  id: string;
  collectionId: string | null;
  collectionName?: string | null;
  projectId: string | null;
  projectName?: string | null;
  /** Derived from the collection — an API's tier is its collection's tier. */
  sourceId?: string | null;
  sourceLabel?: string | null;
  sourceColor?: string | null;
  name: string;
  description: string | null;
  method: string;
  url: string;
  headers: KeyValueEntry[];
  queryParams: KeyValueEntry[];
  pathParams: KeyValueEntry[];
  bodyType: string;
  requestBody: string | null;
  sampleData: Record<string, unknown>;
  authType: string;
  authConfig: Record<string, unknown>;
  expectedStatus: number | null;
  expectedResponse: string | null;
  responseSchema: Record<string, unknown>;
  defaultAssertions: Assertion[];
  timeoutMs: number | null;
  tags: string[];
  ownerId: string | null;
  notes: string | null;
  isDeprecated: boolean;
  usedInFlows?: number;
  createdAt: string;
  updatedAt: string;
}

export function toApi(row: any): ApiDto {
  return {
    id: row.id,
    collectionId: row.collection_id ?? null,
    collectionName: row.collection_name ?? null,
    projectId: row.project_id ?? null,
    projectName: row.project_name ?? null,
    sourceId: row.source_id ?? null,
    sourceLabel: row.source_label ?? null,
    sourceColor: row.source_color ?? null,
    name: row.name,
    description: row.description ?? null,
    method: row.method,
    url: row.url,
    headers: asJson<KeyValueEntry[]>(row.headers, []),
    queryParams: asJson<KeyValueEntry[]>(row.query_params, []),
    pathParams: asJson<KeyValueEntry[]>(row.path_params, []),
    bodyType: row.body_type,
    requestBody: row.request_body ?? null,
    sampleData: asJson<Record<string, unknown>>(row.sample_data, {}),
    authType: row.auth_type,
    authConfig: asJson<Record<string, unknown>>(row.auth_config, {}),
    expectedStatus: row.expected_status ?? null,
    expectedResponse: row.expected_response ?? null,
    responseSchema: asJson<Record<string, unknown>>(row.response_schema, {}),
    defaultAssertions: asJson<Assertion[]>(row.default_assertions, []),
    timeoutMs: row.timeout_ms ?? null,
    tags: row.tags ?? [],
    ownerId: row.owner_id ?? null,
    notes: row.notes ?? null,
    isDeprecated: !!row.is_deprecated,
    usedInFlows: row.used_in_flows !== undefined ? Number(row.used_in_flows) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface EnvironmentDto {
  id: string;
  name: string;
  projectId: string | null;
  baseUrl: string;
  description: string | null;
  variables: EnvVariable[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Secret values are replaced with a marker on the way out. The server keeps the
 * real value; the browser never sees it, and an unchanged marker coming back on
 * update is understood to mean "leave it alone" (see environment.repo.update).
 */
export const SECRET_MASK = '__YAPIEZ_SECRET__';

export function toEnvironment(row: any, opts?: { unmasked?: boolean }): EnvironmentDto {
  const variables = asJson<EnvVariable[]>(row.variables, []).map((v) =>
    v.secret && !opts?.unmasked ? { ...v, value: SECRET_MASK } : v
  );
  return {
    id: row.id,
    name: row.name,
    projectId: row.project_id ?? null,
    baseUrl: row.base_url,
    description: row.description ?? null,
    variables,
    isDefault: !!row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface FlowStepDto {
  id: string;
  flowId: string;
  apiId: string;
  apiName?: string;
  method?: string;
  url?: string;
  position: number;
  stepName: string | null;
  description: string | null;
  overrides: Record<string, unknown>;
  extractions: Extraction[];
  assertions: Assertion[];
  continueOnFailure: boolean;
  isEnabled: boolean;
  delayMs: number;
}

export function toFlowStep(row: any): FlowStepDto {
  return {
    id: row.id,
    flowId: row.flow_id,
    apiId: row.api_id,
    apiName: row.api_name ?? undefined,
    method: row.api_method ?? undefined,
    url: row.api_url ?? undefined,
    position: Number(row.position),
    stepName: row.step_name ?? null,
    description: row.description ?? null,
    overrides: asJson<Record<string, unknown>>(row.overrides, {}),
    extractions: asJson<Extraction[]>(row.extractions, []),
    assertions: asJson<Assertion[]>(row.assertions, []),
    continueOnFailure: !!row.continue_on_failure,
    isEnabled: !!row.is_enabled,
    delayMs: Number(row.delay_ms ?? 0),
  };
}

export interface FlowDto {
  id: string;
  name: string;
  description: string | null;
  scopeId: string | null;
  scopeName?: string | null;
  projectId: string | null;
  environmentId: string | null;
  environmentName?: string | null;
  authApiId: string | null;
  authApiName?: string | null;
  authConfig: Record<string, unknown>;
  stopOnFailure: boolean;
  status: string;
  tags: string[];
  stepCount?: number;
  lastRunId: string | null;
  lastRunStatus: string | null;
  lastRunAt: string | null;
  steps?: FlowStepDto[];
  createdAt: string;
  updatedAt: string;
}

export function toFlow(row: any): FlowDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    scopeId: row.scope_id ?? null,
    scopeName: row.scope_name ?? null,
    projectId: row.project_id ?? null,
    environmentId: row.environment_id ?? null,
    environmentName: row.environment_name ?? null,
    authApiId: row.auth_api_id ?? null,
    authApiName: row.auth_api_name ?? null,
    authConfig: asJson<Record<string, unknown>>(row.auth_config, {}),
    stopOnFailure: !!row.stop_on_failure,
    status: row.status,
    tags: row.tags ?? [],
    stepCount: row.step_count !== undefined ? Number(row.step_count) : undefined,
    lastRunId: row.last_run_id ?? null,
    lastRunStatus: row.last_run_status ?? null,
    lastRunAt: row.last_run_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface RunStepDto {
  id: string;
  runId: string;
  stepId: string | null;
  apiId: string | null;
  position: number;
  stepName: string;
  stepKind: string;
  method: string | null;
  resolvedUrl: string | null;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  statusCode: number | null;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  responseSize: number | null;
  durationMs: number | null;
  status: string;
  assertionResults: unknown[];
  extracted: Record<string, unknown>;
  error: string | null;
  bugId: string | null;
  bugNumber?: string | null;
}

export function toRunStep(row: any): RunStepDto {
  return {
    id: row.id,
    runId: row.run_id,
    stepId: row.step_id ?? null,
    apiId: row.api_id ?? null,
    position: Number(row.position),
    stepName: row.step_name,
    stepKind: row.step_kind,
    method: row.method ?? null,
    resolvedUrl: row.resolved_url ?? null,
    requestHeaders: asJson<Record<string, string>>(row.request_headers, {}),
    requestBody: row.request_body ?? null,
    statusCode: row.status_code ?? null,
    responseHeaders: asJson<Record<string, string>>(row.response_headers, {}),
    responseBody: row.response_body ?? null,
    responseSize: row.response_size ?? null,
    durationMs: row.duration_ms ?? null,
    status: row.status,
    assertionResults: asJson<unknown[]>(row.assertion_results, []),
    extracted: asJson<Record<string, unknown>>(row.extracted, {}),
    error: row.error ?? null,
    bugId: row.bug_id ?? null,
    bugNumber: row.bug_number ?? null,
  };
}

export interface RunDto {
  id: string;
  flowId: string;
  flowName?: string | null;
  environmentId: string | null;
  environmentName?: string | null;
  scopeId: string | null;
  scopeName?: string | null;
  runNumber: number;
  runName: string | null;
  status: string;
  triggerSource: string;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  durationMs: number | null;
  variables: Record<string, unknown>;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  triggeredBy: string | null;
  steps?: RunStepDto[];
}

export function toRun(row: any): RunDto {
  return {
    id: row.id,
    flowId: row.flow_id,
    flowName: row.flow_name ?? null,
    environmentId: row.environment_id ?? null,
    environmentName: row.environment_name ?? null,
    scopeId: row.scope_id ?? null,
    scopeName: row.scope_name ?? null,
    runNumber: Number(row.run_number),
    runName: row.run_name ?? null,
    status: row.status,
    triggerSource: row.trigger_source,
    totalSteps: Number(row.total_steps),
    passedSteps: Number(row.passed_steps),
    failedSteps: Number(row.failed_steps),
    skippedSteps: Number(row.skipped_steps),
    durationMs: row.duration_ms ?? null,
    variables: asJson<Record<string, unknown>>(row.variables, {}),
    error: row.error ?? null,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? null,
    triggeredBy: row.triggered_by ?? null,
  };
}
