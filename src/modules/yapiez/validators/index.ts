// src/modules/yapiez/validators/index.ts
// Request-body schemas. Controllers parse with these so a malformed payload is
// a 400 with field paths, never a Postgres error.

import { z } from 'zod';
import {
  ASSERTION_OPERATORS,
  ASSERTION_SOURCES,
  AUTH_TYPES,
  BODY_TYPES,
  EXTRACTION_SOURCES,
  HTTP_METHODS,
} from '../types';

const uuid = z.string().uuid();
const nullableUuid = z.union([uuid, z.literal(''), z.null()]).optional().transform((v) => (v ? v : null));

const keyValueEntry = z.object({
  key: z.string().min(1, 'Key is required'),
  value: z.string().default(''),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  required: z.boolean().optional(),
  secret: z.boolean().optional(),
});

export const assertionSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  source: z.enum(ASSERTION_SOURCES),
  path: z.string().optional(),
  operator: z.enum(ASSERTION_OPERATORS),
  expected: z.string().optional(),
});

export const extractionSchema = z.object({
  // The variable name is what QA later types as {{name}}, so keep it to
  // identifier characters — a space or a brace here silently never resolves.
  variable: z
    .string()
    .min(1, 'Variable name is required')
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Use letters, numbers and underscores, starting with a letter'),
  source: z.enum(EXTRACTION_SOURCES),
  path: z.string().optional(),
  required: z.boolean().optional(),
});

// ─── Sources ────────────────────────────────────────────────────────────────

export const sourceCreateSchema = z.object({
  label: z.string().min(1, 'Name is required').max(60),
  // Optional: derived from the label when omitted. Kept stable across renames
  // so nothing referencing a tier breaks when someone retitles it.
  key: z
    .string()
    .max(40)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, numbers and hyphens')
    .optional(),
  description: z.string().max(500).optional().nullable(),
  color: z.string().max(32).optional().nullable(),
  sort: z.number().int().min(0).max(10_000).optional(),
  isDefault: z.boolean().default(false),
});

export const sourceUpdateSchema = sourceCreateSchema.partial();

// ─── Collections ────────────────────────────────────────────────────────────

export const collectionCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(160),
  /** The module this collection lives inside — a NAME, as on the API itself. */
  moduleName: z.string().max(255).optional().nullable(),
  sourceId: nullableUuid,
  description: z.string().max(2000).optional().nullable(),
  projectId: z.string().optional().nullable(),
  color: z.string().max(32).optional().nullable(),
});

export const collectionUpdateSchema = collectionCreateSchema.partial();


// ─── APIs ───────────────────────────────────────────────────────────────────

export const apiCreateSchema = z.object({
  collectionId: nullableUuid,
  /**
   * Project ids are Prisma-era TEXT, not uuids — a uuid() check here would
   * reject every real one. Null means shared across all projects.
   */
  projectId: z.string().max(64).optional().nullable(),
  /** The tier the definition describes, set on the API rather than derived. */
  sourceId: nullableUuid,
  /**
   * A QA module NAME, not an id — the same value bugs and test cases store,
   * so the two lists stay comparable without a join. Blank means unfiled.
   */
  moduleName: z.string().max(255).optional().nullable(),
  name: z.string().min(1, 'API name is required').max(200),
  // The editor writes HTML, and markup inflates a paragraph well past what a
  // plain-text cap allowed. The column is TEXT, so the ceiling is only here.
  description: z.string().max(40_000).optional().nullable(),
  method: z.enum(HTTP_METHODS),
  url: z.string().min(1, 'URL is required').max(2000),
  headers: z.array(keyValueEntry).default([]),
  queryParams: z.array(keyValueEntry).default([]),
  pathParams: z.array(keyValueEntry).default([]),
  bodyType: z.enum(BODY_TYPES).default('none'),
  requestBody: z.string().optional().nullable(),
  sampleData: z.record(z.any()).default({}),
  authType: z.enum(AUTH_TYPES).default('inherit'),
  authConfig: z.record(z.any()).default({}),
  expectedStatus: z.number().int().min(100).max(599).optional().nullable(),
  expectedResponse: z.string().optional().nullable(),
  responseSchema: z.record(z.any()).default({}),
  defaultAssertions: z.array(assertionSchema).default([]),
  timeoutMs: z.number().int().min(100).max(120_000).optional().nullable(),
  tags: z.array(z.string()).default([]),
  ownerId: nullableUuid,
  notes: z.string().max(4000).optional().nullable(),
  isDeprecated: z.boolean().default(false),
});

export const apiUpdateSchema = apiCreateSchema;

// ─── Environments ───────────────────────────────────────────────────────────

export const environmentCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  /** Null means shared across every project. */
  projectId: z.string().max(64).optional().nullable(),
  baseUrl: z.string().min(1, 'Base URL is required').max(500),
  description: z.string().max(1000).optional().nullable(),
  variables: z
    .array(
      z.object({
        key: z.string().min(1).regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Use letters, numbers and underscores'),
        value: z.string().default(''),
        secret: z.boolean().optional(),
      })
    )
    .default([]),
  isDefault: z.boolean().default(false),
});

export const environmentUpdateSchema = environmentCreateSchema.partial();

// ─── Flows ──────────────────────────────────────────────────────────────────

export const flowAuthConfigSchema = z.object({
  tokenPath: z.string().max(200).optional(),
  variableName: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).optional(),
  headerName: z.string().max(120).optional(),
  scheme: z.string().max(40).optional(),
  body: z.string().optional(),
  disabled: z.boolean().optional(),
});

export const flowCreateSchema = z.object({
  name: z.string().min(1, 'Flow name is required').max(200),
  description: z.string().max(4000).optional().nullable(),
  scopeId: nullableUuid,
  projectId: z.string().optional().nullable(),
  environmentId: nullableUuid,
  authApiId: nullableUuid,
  authConfig: flowAuthConfigSchema.default({}),
  stopOnFailure: z.boolean().default(true),
  status: z.enum(['Active', 'Draft', 'Archived']).default('Active'),
  tags: z.array(z.string()).default([]),
});

export const flowUpdateSchema = flowCreateSchema.partial();

export const stepOverridesSchema = z.object({
  url: z.string().max(2000).optional(),
  headers: z.array(keyValueEntry).optional(),
  queryParams: z.array(keyValueEntry).optional(),
  pathParams: z.array(keyValueEntry).optional(),
  body: z.string().optional(),
  bodyType: z.enum(BODY_TYPES).optional(),
  timeoutMs: z.number().int().min(100).max(120_000).optional(),
  skipAuth: z.boolean().optional(),
});

export const stepCreateSchema = z.object({
  apiId: uuid,
  position: z.number().int().min(0).optional(),
  stepName: z.string().max(200).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  overrides: stepOverridesSchema.default({}),
  extractions: z.array(extractionSchema).default([]),
  assertions: z.array(assertionSchema).default([]),
  continueOnFailure: z.boolean().default(false),
  isEnabled: z.boolean().default(true),
  delayMs: z.number().int().min(0).max(30_000).default(0),
});

export const stepUpdateSchema = stepCreateSchema.partial();

export const reorderSchema = z.object({
  stepIds: z.array(uuid).min(1, 'Provide the step order'),
});

// ─── Execution ──────────────────────────────────────────────────────────────

/**
 * "Send" from the definition editor.
 *
 * The definition travels inline rather than by id: the author is mid-draft and
 * may never have saved it. `.partial()` on the write schema keeps one source of
 * truth for the field shapes while letting a half-written draft through — the
 * only genuinely required field is the URL, checked in the service.
 *
 * Declared here, after flowAuthConfigSchema: `const` is hoisted but not
 * initialised, so referencing it from an earlier section throws at import.
 */
export const tryApiSchema = z.object({
  definition: apiCreateSchema
    .partial()
    .extend({ url: z.string().min(1, 'A URL is required to send a request') }),
  environmentId: nullableUuid,
  /**
   * Resolve {{baseUrl}} against this instead of an environment's.
   *
   * The editor sends a base URL typed on the send bar, which is all a
   * one-off "does this endpoint answer" needs. The environment path stays for
   * callers that have one.
   */
  baseUrl: z.string().max(2000).optional().nullable(),
  variables: z.record(z.string()).default({}),
  /** Run this login API first and attach the token it returns. */
  authApiId: nullableUuid,
  authConfig: flowAuthConfigSchema.default({}),
});

/** Light-touch grammar correction for a definition's free text. */
export const grammarSchema = z.object({
  text: z.string().min(1, 'There is nothing to correct yet').max(8000),
});

export const runFlowSchema = z.object({
  environmentId: nullableUuid,
  /**
   * Resolve {{baseUrl}} against this instead of an environment's.
   *
   * The editor sends a base URL typed on the send bar, which is all a
   * one-off "does this endpoint answer" needs. The environment path stays for
   * callers that have one.
   */
  baseUrl: z.string().max(2000).optional().nullable(),
  variables: z.record(z.string()).default({}),
  runName: z.string().max(200).optional().nullable(),
  onlyStepIds: z.array(uuid).optional(),
});

/**
 * Raising a bug from a failed step. `sheetId` says where in the Bug List it
 * lands; everything else is prefilled from the run and can be edited first.
 */
export const raiseBugSchema = z.object({
  sheetId: z.string().min(1, 'Choose a bug sheet'),
  folderId: z.string().min(1, 'Choose a bug folder'),
  title: z.string().max(300).optional(),
  description: z.string().min(1, 'Description is required'),
  severity: z.string().max(60).optional(),
  bugType: z.string().max(60).optional(),
  module: z.string().max(160).optional(),
  assigneeId: z.string().optional().nullable(),
});

// ─── Case payloads ──────────────────────────────────────────────────────────
//
// The four types are a closed set, not free text: the QA drawer offers exactly
// these and the table has a CHECK constraint on the same list, so a typo here
// would surface as a Postgres error rather than a 400.

export const PAYLOAD_TYPES = ['Positive', 'Negative', 'Valid', 'Invalid'] as const;

/** Ask the server to draft a payload from an API definition. Writes nothing. */
export const payloadGenerateSchema = z.object({
  apiId: uuid,
  payloadType: z.enum(PAYLOAD_TYPES),
  /** Optional steer, e.g. "an order with no line items". */
  hint: z.string().max(500).optional().nullable(),
});

export const payloadCreateSchema = z.object({
  apiId: uuid,
  payloadType: z.enum(PAYLOAD_TYPES),
  name: z.string().min(1, 'Name is required').max(160),
  // Any JSON object — the shape is the API's contract, not ours to police.
  payload: z.record(z.any()).default({}),
  expectedStatus: z.number().int().min(100).max(599).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  generatedBy: z.enum(['ai', 'structure', 'manual']).default('manual'),
  // Absent while the case is still being drafted in the create drawer — the
  // payload is adopted by `linkPayloads` once that case is saved.
  testCaseId: nullableUuid,
  parentTestCaseId: nullableUuid,
});

export const payloadUpdateSchema = z.object({
  payloadType: z.enum(PAYLOAD_TYPES).optional(),
  name: z.string().min(1).max(160).optional(),
  payload: z.record(z.any()).optional(),
  expectedStatus: z.number().int().min(100).max(599).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

/** Adopt payloads drafted before their case existed. */
export const payloadLinkSchema = z.object({
  testCaseId: uuid,
  payloadIds: z.array(uuid).min(1, 'Nothing to link'),
});

// ─── Inferred input types ───────────────────────────────────────────────────
//
// Repositories take these rather than hand-written interfaces, so the schema
// stays the single source of truth for a payload's shape.
//
// NOTE on the shapes below: this project compiles with `strictNullChecks:
// false`, under which zod infers EVERY key as optional — `undefined extends T`
// is true for every T, so its "add question marks" conditional matches
// everywhere. The required-ness above is therefore enforced at runtime by
// `.parse()`, not by the compiler. Do not read `name?: string` here as "name is
// optional"; read the schema.

export type SourceCreateInput = z.infer<typeof sourceCreateSchema>;
export type SourceUpdateInput = z.infer<typeof sourceUpdateSchema>;
export type CollectionCreateInput = z.infer<typeof collectionCreateSchema>;
export type CollectionUpdateInput = z.infer<typeof collectionUpdateSchema>;
export type ApiWriteInput = z.infer<typeof apiCreateSchema>;
export type EnvironmentCreateInput = z.infer<typeof environmentCreateSchema>;
export type EnvironmentUpdateInput = z.infer<typeof environmentUpdateSchema>;
export type FlowCreateInput = z.infer<typeof flowCreateSchema>;
export type FlowUpdateInput = z.infer<typeof flowUpdateSchema>;
export type StepCreateInput = z.infer<typeof stepCreateSchema>;
export type StepUpdateInput = z.infer<typeof stepUpdateSchema>;
export type RunFlowInput = z.infer<typeof runFlowSchema>;
export type RaiseBugRequest = z.infer<typeof raiseBugSchema>;
export type TryApiInput = z.infer<typeof tryApiSchema>;
export type GrammarInput = z.infer<typeof grammarSchema>;
export type PayloadGenerateInput = z.infer<typeof payloadGenerateSchema>;
export type PayloadCreateInput = z.infer<typeof payloadCreateSchema>;
export type PayloadUpdateInput = z.infer<typeof payloadUpdateSchema>;
export type PayloadLinkInput = z.infer<typeof payloadLinkSchema>;
