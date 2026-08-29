// src/modules/yapiez/services/flowRunner.ts
//
// The execution layer. Run Flow means, in order:
//
//   1. Seed the variable context from the environment ({{baseUrl}}, credentials)
//   2. Execute the flow's authentication API and store the token
//   3. Execute each enabled step against that context, in position order
//   4. After each step: assert, extract, persist
//   5. Close the run with a Passed / Failed verdict
//
// TRANSACTIONS: a run can take a minute of wall-clock time, which is far too
// long to hold one open. Every persistence point is therefore its own short
// withTenant() call. The cost is that a process crash mid-run leaves the run
// row in 'Running'; `reconcileStaleRuns` below sweeps those up on boot.

import { withTenant } from '../db/pool';
import * as flowRepo from '../repositories/flow.repo';
import * as environmentRepo from '../repositories/environment.repo';
import * as catalogRepo from '../repositories/catalog.repo';
import * as runRepo from '../repositories/run.repo';
import { ApiDto, EnvironmentDto, FlowDto, RunDto } from '../repositories/mappers';
import {
  Assertion,
  Extraction,
  FlowAuthConfig,
  StepOverrides,
  StepStatus,
  YapiezError,
} from '../types';
import { evaluateAssertions, ExecutedResponse } from './assertions';
import { AuthHeader, buildRequest } from './requestBuilder';
import { maskSecrets, readPath, render, VariableContext } from './template';
import { execute } from './transport';

const AUTH_DEFAULTS: Required<Pick<FlowAuthConfig, 'tokenPath' | 'variableName' | 'headerName' | 'scheme'>> = {
  tokenPath: 'access_token',
  variableName: 'accessToken',
  headerName: 'Authorization',
  scheme: 'Bearer',
};

export interface RunOptions {
  /** Override the flow's saved environment for this run only. */
  environmentId?: string;
  /** Ad-hoc variables layered on top of the environment (never persisted raw). */
  variables?: Record<string, string>;
  runName?: string;
  triggerSource?: string;
  /** Execute only these step ids — used by the builder's "run this step" action. */
  onlyStepIds?: string[];
}

interface StepOutcome {
  status: StepStatus;
  extracted: Record<string, unknown>;
}

/** Everything the runner needs, loaded in one tenant transaction up front. */
async function loadPlan(tenantId: string, flowId: string, options: RunOptions) {
  return withTenant(tenantId, async (c) => {
    const flow = await flowRepo.getFlow(c, flowId);

    const environmentId = options.environmentId ?? flow.environmentId;
    const environment = environmentId
      ? await environmentRepo.getEnvironmentForRun(c, environmentId)
      : await environmentRepo.getDefaultEnvironment(c);

    // Resolve every API a step points at once, so the loop never queries.
    const apis = new Map<string, ApiDto>();
    for (const step of flow.steps ?? []) {
      if (!apis.has(step.apiId)) apis.set(step.apiId, await catalogRepo.getApi(c, step.apiId));
    }
    const authApi = flow.authApiId ? await catalogRepo.getApi(c, flow.authApiId) : null;

    return { flow, environment, apis, authApi };
  });
}

/** Seed the run's variables: environment first, then per-run overrides. */
function seedContext(
  environment: EnvironmentDto | null,
  overrides: Record<string, string> | undefined
): { context: VariableContext; secretKeys: Set<string> } {
  const context: VariableContext = {};
  const secretKeys = new Set<string>();

  if (environment) {
    context.baseUrl = environment.baseUrl;
    for (const variable of environment.variables) {
      context[variable.key] = variable.value;
      if (variable.secret) secretKeys.add(variable.key);
    }
  }
  for (const [key, value] of Object.entries(overrides ?? {})) {
    context[key] = value;
  }
  return { context, secretKeys };
}

/**
 * Execute the login API and turn its response into the header every later step
 * carries. Returns null when the flow has no auth step or auth is disabled.
 *
 * A failed authentication is fatal for the run: continuing would produce a
 * cascade of 401s that says nothing about the APIs under test.
 */
async function runAuthStep(
  tenantId: string,
  run: RunDto,
  flow: FlowDto,
  authApi: ApiDto | null,
  environment: EnvironmentDto | null,
  context: VariableContext,
  position: number
): Promise<{ header: AuthHeader | null; failed: boolean }> {
  const config = { ...AUTH_DEFAULTS, ...((flow.authConfig ?? {}) as FlowAuthConfig) };
  if (!authApi || config.disabled) return { header: null, failed: false };

  const overrides: StepOverrides = config.body ? { body: config.body } : {};
  const request = buildRequest({
    api: authApi,
    overrides,
    baseUrl: environment?.baseUrl ?? null,
    context,
    authHeader: null,
  });

  const result = await execute(request);
  const token = readPath(result.response.body, config.tokenPath);
  const gotToken = token !== undefined && token !== null && String(token).length > 0;

  const transportOk = !result.error && result.response.statusCode >= 200 && result.response.statusCode < 400;
  const passed = transportOk && gotToken;

  if (gotToken) context[config.variableName] = token;

  await withTenant(tenantId, (c) =>
    runRepo.recordRunStep(c, run.id, {
      stepId: null,
      apiId: authApi.id,
      position,
      stepName: `Authentication — ${authApi.name}`,
      stepKind: 'auth',
      method: request.method,
      resolvedUrl: result.finalUrl,
      // The credentials that produced the token are not written to the record.
      requestHeaders: redactHeaders(request.headers),
      requestBody: '(hidden — authentication request)',
      statusCode: result.response.statusCode || null,
      responseHeaders: result.response.headers,
      // Neither is the token itself; the run proves auth succeeded, it is not a
      // place to go and read a live credential out of later.
      responseBody: passed
        ? `(hidden — token stored as {{${config.variableName}}})`
        : truncateForRecord(result.response.rawBody),
      responseSize: result.response.byteSize,
      durationMs: result.response.durationMs,
      status: passed ? 'Pass' : 'Fail',
      assertionResults: [
        {
          name: `Token found at "${config.tokenPath}"`,
          source: 'body',
          path: config.tokenPath,
          operator: 'exists',
          passed: gotToken,
          message: gotToken
            ? `Stored as {{${config.variableName}}}`
            : `No value at "${config.tokenPath}" in the login response — check the token path on the flow's authentication settings.`,
        },
      ],
      extracted: gotToken ? { [config.variableName]: '••••••••' } : {},
      error: result.error ?? (passed ? null : 'Authentication did not yield a token'),
    })
  );

  if (!passed) return { header: null, failed: true };

  const value = config.scheme ? `${config.scheme} ${token}` : String(token);
  return { header: { name: config.headerName, value }, failed: false };
}

/** Apply a step's extractions to its response, writing into the run context. */
function applyExtractions(
  extractions: Extraction[],
  response: ExecutedResponse,
  context: VariableContext
): { extracted: Record<string, unknown>; missing: string[] } {
  const extracted: Record<string, unknown> = {};
  const missing: string[] = [];

  for (const extraction of extractions) {
    if (!extraction?.variable) continue;
    let value: unknown;
    if (extraction.source === 'status') value = response.statusCode;
    else if (extraction.source === 'header') value = response.headers[(extraction.path ?? '').toLowerCase()];
    else value = readPath(response.body, extraction.path);

    if (value === undefined || value === null) {
      if (extraction.required) missing.push(extraction.variable);
      continue;
    }
    context[extraction.variable] = value;
    extracted[extraction.variable] = value;
  }

  return { extracted, missing };
}

/** Authorization / cookie values are not written into the run record. */
function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = /authorization|cookie|api-key|x-api-key|token/i.test(key) ? '••••••••' : value;
  }
  return out;
}

function truncateForRecord(value: string): string {
  const LIMIT = 100_000;
  return value.length > LIMIT ? `${value.slice(0, LIMIT)}\n…[truncated]` : value;
}

/**
 * Run one flow end to end.
 *
 * Resolves once the run is finished — the HTTP caller waits for the result,
 * which is what "click Run and watch the steps light up" needs. Long flows are
 * bounded by the per-request timeout in transport.ts.
 */
export async function runFlow(
  tenantId: string,
  userId: string,
  flowId: string,
  options: RunOptions = {}
): Promise<RunDto> {
  const { flow, environment, apis, authApi } = await loadPlan(tenantId, flowId, options);

  const allSteps = (flow.steps ?? []).filter((s) => s.isEnabled);
  const steps = options.onlyStepIds?.length
    ? allSteps.filter((s) => options.onlyStepIds!.includes(s.id))
    : allSteps;

  if (!steps.length && !authApi) {
    throw YapiezError.badRequest('This flow has no enabled steps to run.');
  }

  const { context, secretKeys } = seedContext(environment, options.variables);
  const startedAt = Date.now();

  const run = await withTenant(tenantId, (c) =>
    runRepo.startRun(c, {
      flowId: flow.id,
      environmentId: environment?.id ?? null,
      scopeId: flow.scopeId,
      runName: options.runName ?? null,
      // The auth step occupies a slot in the run's step list, so count it.
      totalSteps: steps.length + (authApi && !(flow.authConfig as FlowAuthConfig)?.disabled ? 1 : 0),
      triggerSource: options.triggerSource ?? 'manual',
      triggeredBy: userId,
    })
  );

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let position = 0;
  let runError: string | null = null;

  try {
    const auth = await runAuthStep(tenantId, run, flow, authApi, environment, context, position);
    if (authApi && !(flow.authConfig as FlowAuthConfig)?.disabled) {
      position += 1;
      if (auth.failed) failed += 1;
      else passed += 1;
    }

    // Authentication is a precondition, not a step to push past.
    let aborted = auth.failed;
    if (aborted) runError = 'Authentication failed — the remaining steps were not executed.';

    for (const step of steps) {
      const api = apis.get(step.apiId);
      const stepName = step.stepName || api?.name || 'Step';

      if (aborted) {
        await withTenant(tenantId, (c) =>
          runRepo.recordRunStep(c, run.id, {
            stepId: step.id,
            apiId: step.apiId,
            position,
            stepName,
            stepKind: 'api',
            method: api?.method ?? null,
            resolvedUrl: null,
            requestHeaders: {},
            requestBody: null,
            statusCode: null,
            responseHeaders: {},
            responseBody: null,
            responseSize: null,
            durationMs: null,
            status: 'Skipped',
            assertionResults: [],
            extracted: {},
            error: 'Skipped — an earlier step failed and this flow stops on failure.',
          })
        );
        skipped += 1;
        position += 1;
        continue;
      }

      if (!api) {
        // The definition was deleted out from under the flow.
        await withTenant(tenantId, (c) =>
          runRepo.recordRunStep(c, run.id, {
            stepId: step.id,
            apiId: step.apiId,
            position,
            stepName,
            stepKind: 'api',
            method: null,
            resolvedUrl: null,
            requestHeaders: {},
            requestBody: null,
            statusCode: null,
            responseHeaders: {},
            responseBody: null,
            responseSize: null,
            durationMs: null,
            status: 'Fail',
            assertionResults: [],
            extracted: {},
            error: 'The API definition for this step no longer exists.',
          })
        );
        failed += 1;
        position += 1;
        if (flow.stopOnFailure && !step.continueOnFailure) aborted = true;
        continue;
      }

      if (step.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(step.delayMs, 30_000)));
      }

      const outcome = await executeStep({
        tenantId,
        runId: run.id,
        position,
        stepName,
        step,
        api,
        environment,
        context,
        authHeader: auth.header,
      });

      if (outcome.status === 'Pass') passed += 1;
      else failed += 1;
      position += 1;

      if (outcome.status === 'Fail' && flow.stopOnFailure && !step.continueOnFailure) {
        aborted = true;
        runError = runError ?? `"${stepName}" failed and this flow stops on failure.`;
      }
    }
  } catch (err: any) {
    // A thrown error here means the runner itself broke (not an API failing).
    // Close the run rather than leaving it Running forever.
    runError = err?.message || 'The run stopped unexpectedly.';
  }

  const status = failed > 0 ? 'Failed' : 'Passed';

  return withTenant(tenantId, (c) =>
    runRepo.finishRun(c, run.id, {
      status,
      passedSteps: passed,
      failedSteps: failed,
      skippedSteps: skipped,
      durationMs: Date.now() - startedAt,
      variables: maskSecrets(context, secretKeys),
      error: runError,
    })
  );
}

interface ExecuteStepInput {
  tenantId: string;
  runId: string;
  position: number;
  stepName: string;
  step: { id: string; apiId: string; overrides: Record<string, unknown>; extractions: Extraction[]; assertions: Assertion[] };
  api: ApiDto;
  environment: EnvironmentDto | null;
  context: VariableContext;
  authHeader: AuthHeader | null;
}

/** Build → send → assert → extract → persist, for one step. */
async function executeStep(input: ExecuteStepInput): Promise<StepOutcome> {
  const { tenantId, runId, position, stepName, step, api, environment, context, authHeader } = input;

  const request = buildRequest({
    api,
    overrides: step.overrides as StepOverrides,
    baseUrl: environment?.baseUrl ?? null,
    context,
    authHeader,
  });

  let result;
  try {
    result = await execute(request);
  } catch (err: any) {
    // Only the SSRF guard and URL parsing throw here; both are step failures,
    // not run failures, so the rest of the flow can still be attempted.
    await withTenant(tenantId, (c) =>
      runRepo.recordRunStep(c, runId, {
        stepId: step.id,
        apiId: api.id,
        position,
        stepName,
        stepKind: 'api',
        method: request.method,
        resolvedUrl: request.url,
        requestHeaders: redactHeaders(request.headers),
        requestBody: request.body ?? null,
        statusCode: null,
        responseHeaders: {},
        responseBody: null,
        responseSize: null,
        durationMs: null,
        status: 'Fail',
        assertionResults: [],
        extracted: {},
        error: err?.message || 'The request could not be sent.',
      })
    );
    return { status: 'Fail', extracted: {} };
  }

  // A step's own assertions replace the API's defaults; with none authored, the
  // developer's defaults stand in, and with neither, "2xx is a pass" applies.
  const assertions = step.assertions?.length ? step.assertions : api.defaultAssertions ?? [];
  const expectedStatus = api.expectedStatus;
  const effective: Assertion[] =
    !step.assertions?.length && !api.defaultAssertions?.length && expectedStatus
      ? [{ source: 'status', operator: 'equals', expected: String(expectedStatus), name: `Status is ${expectedStatus}` }]
      : assertions;

  const outcome = result.error
    ? { passed: false, results: [] }
    : evaluateAssertions(effective, result.response, context);

  const { extracted, missing } = result.error
    ? { extracted: {}, missing: [] as string[] }
    : applyExtractions(step.extractions ?? [], result.response, context);

  const problems: string[] = [];
  if (result.error) problems.push(result.error);
  if (request.missingVariables.length) {
    problems.push(
      `Unresolved variable(s): ${request.missingVariables.map((v) => `{{${v}}}`).join(', ')} — the request was sent with the placeholder text.`
    );
  }
  if (missing.length) {
    problems.push(`Required extraction(s) found nothing: ${missing.join(', ')}`);
  }

  const status: StepStatus =
    result.error || !outcome.passed || missing.length ? 'Fail' : 'Pass';

  await withTenant(tenantId, (c) =>
    runRepo.recordRunStep(c, runId, {
      stepId: step.id,
      apiId: api.id,
      position,
      stepName,
      stepKind: 'api',
      method: request.method,
      resolvedUrl: result.finalUrl,
      requestHeaders: redactHeaders(request.headers),
      requestBody: request.body ?? null,
      statusCode: result.response.statusCode || null,
      responseHeaders: result.response.headers,
      responseBody: truncateForRecord(result.response.rawBody),
      responseSize: result.response.byteSize,
      durationMs: result.response.durationMs,
      status,
      assertionResults: outcome.results,
      extracted,
      error: problems.length ? problems.join(' ') : null,
    })
  );

  return { status, extracted };
}

/**
 * Close runs left in 'Running' by a process that died mid-execution.
 * Called once on boot; without it those runs are indistinguishable from a run
 * that is genuinely still going.
 */
export async function reconcileStaleRuns(tenantId?: string): Promise<number> {
  const { yapiezPool } = await import('../db/pool');
  const params: any[] = [];
  let where = `status = 'Running' AND started_at < NOW() - INTERVAL '30 minutes'`;
  if (tenantId) {
    params.push(tenantId);
    where += ` AND tenant_id = $1`;
  }
  const { rowCount } = await yapiezPool.query(
    `UPDATE yapiez_flow_runs
        SET status = 'Aborted',
            finished_at = NOW(),
            error = COALESCE(error, 'The run did not complete — the server restarted while it was executing.')
      WHERE ${where}`,
    params
  );
  return rowCount ?? 0;
}
