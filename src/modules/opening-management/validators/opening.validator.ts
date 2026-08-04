// src/modules/opening-management/validators/opening.validator.ts
// Zod schemas for Opening input. Controllers parse request bodies/queries
// through these so services receive already-validated, typed data.

import { z } from 'zod';

// ─── Primitives ─────────────────────────────────────────────────────────────

/** An optional reference to a row in a Prisma-owned table. '' is treated as null. */
const refId = z
  .string()
  .trim()
  .max(64)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** A tag list — trimmed, blank-free, de-duplicated case-insensitively. */
const tagList = z
  .array(z.string().trim().min(1).max(120))
  .max(100)
  .optional()
  .transform((v) => {
    if (!v) return undefined;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const tag of v) {
      const key = tag.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(tag);
      }
    }
    return out;
  });

const money = z.number().min(0).max(1_000_000_000_000).optional().nullable();

export const employmentTypeEnum = z.enum([
  'full_time',
  'part_time',
  'contract',
  'internship',
  'freelance',
]);
export const workModeEnum = z.enum(['remote', 'hybrid', 'office']);
export const salaryPeriodEnum = z.enum(['hourly', 'monthly', 'yearly']);
export const priorityEnum = z.enum(['low', 'medium', 'high', 'critical']);
export const hiringTypeEnum = z.enum(['replacement', 'new_position', 'expansion', 'backfill']);
export const visibilityEnum = z.enum(['internal_only', 'external_only', 'both']);
export const hiringTeamMemberTypeEnum = z.enum([
  'hiring_manager',
  'technical_panel',
  'hr',
  'client_interviewer',
]);
export const openingStatusEnum = z.enum([
  'draft',
  'pending_approval',
  'approved',
  'internal_posting',
  'external_posting',
  'in_progress',
  'on_hold',
  'filled',
  'cancelled',
  'closed',
]);

// ─── Child collections ──────────────────────────────────────────────────────

export const recruiterSchema = z.object({
  recruiterId: z.string().trim().min(1, 'recruiterId is required').max(64),
  isPrimary: z.boolean().default(false),
});

export const hiringTeamMemberSchema = z
  .object({
    memberType: hiringTeamMemberTypeEnum,
    memberId: refId,
    memberName: optionalText(160),
    // preprocess: an empty form field arrives as '' and must not fail .email().
    memberEmail: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
      z.string().trim().email('memberEmail must be a valid email').max(160).nullable().optional()
    ),
  })
  .refine((m) => m.memberId !== null || m.memberName !== null, {
    message: 'Each hiring team member needs either memberId (internal) or memberName (external)',
  });

export const requiredDocumentSchema = z.object({
  documentName: z.string().trim().min(1, 'documentName is required').max(120),
  isMandatory: z.boolean().default(true),
  notes: optionalText(500),
});

// ─── Create ─────────────────────────────────────────────────────────────────

const openingBaseShape = {
  // Linkage
  clientId: refId,
  projectId: refId,
  departmentId: refId,
  subDepartmentId: refId,
  hiringManagerId: refId,
  employmentTypeId: refId,
  employmentType: employmentTypeEnum,
  workMode: workModeEnum,
  locationId: refId,
  location: optionalText(200),
  numberOfPositions: z.number().int().min(1).max(10_000).default(1),

  // Job details
  jobTitle: z.string().trim().min(1, 'jobTitle is required').max(200),
  jobDescription: optionalText(20_000),
  responsibilities: optionalText(20_000),
  requiredSkills: tagList,
  preferredSkills: tagList,
  minExperience: z.number().min(0).max(60).optional().nullable(),
  maxExperience: z.number().min(0).max(60).optional().nullable(),
  education: optionalText(500),
  certifications: tagList,
  salaryMin: money,
  salaryMax: money,
  salaryCurrency: z.string().trim().length(3, 'salaryCurrency must be a 3-letter code').toUpperCase().default('INR'),
  salaryPeriod: salaryPeriodEnum.default('yearly'),
  budget: money,
  noticePeriodDays: z.number().int().min(0).max(365).optional().nullable(),
  shiftTiming: optionalText(200),
  joiningTimeline: optionalText(200),
  targetJoiningDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'targetJoiningDate must be YYYY-MM-DD')
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),

  // Classification
  priority: priorityEnum.default('medium'),
  hiringType: hiringTypeEnum.optional().nullable(),
  visibility: visibilityEnum.default('both'),
};

/** Range + single-primary rules, shared by create and update. */
function applyCrossFieldRules<T extends z.ZodTypeAny>(schema: T) {
  return schema
    .refine(
      (d: any) =>
        d.minExperience == null ||
        d.maxExperience == null ||
        d.maxExperience >= d.minExperience,
      { message: 'maxExperience must be greater than or equal to minExperience', path: ['maxExperience'] }
    )
    .refine(
      (d: any) => d.salaryMin == null || d.salaryMax == null || d.salaryMax >= d.salaryMin,
      { message: 'salaryMax must be greater than or equal to salaryMin', path: ['salaryMax'] }
    )
    .refine(
      (d: any) => !d.recruiters || d.recruiters.filter((r: any) => r.isPrimary).length <= 1,
      { message: 'Only one recruiter can be marked primary', path: ['recruiters'] }
    )
    .refine(
      (d: any) =>
        !d.recruiters ||
        new Set(d.recruiters.map((r: any) => r.recruiterId)).size === d.recruiters.length,
      { message: 'The same recruiter cannot be assigned twice', path: ['recruiters'] }
    )
    .refine(
      (d: any) =>
        !d.requiredDocuments ||
        new Set(d.requiredDocuments.map((doc: any) => doc.documentName.toLowerCase())).size ===
          d.requiredDocuments.length,
      { message: 'Duplicate document names are not allowed', path: ['requiredDocuments'] }
    );
}

export const createOpeningSchema = applyCrossFieldRules(
  z.object({
    ...openingBaseShape,
    recruiters: z.array(recruiterSchema).max(50).optional(),
    hiringTeam: z.array(hiringTeamMemberSchema).max(100).optional(),
    requiredDocuments: z.array(requiredDocumentSchema).max(50).optional(),
  })
);

// ─── Update ─────────────────────────────────────────────────────────────────
// Every field optional; at least one must be present. Child collections, when
// supplied, REPLACE the existing set (omit them to leave the set untouched).

export const updateOpeningSchema = applyCrossFieldRules(
  z
    .object({
      ...openingBaseShape,
      recruiters: z.array(recruiterSchema).max(50).optional(),
      hiringTeam: z.array(hiringTeamMemberSchema).max(100).optional(),
      requiredDocuments: z.array(requiredDocumentSchema).max(50).optional(),
    })
    .partial()
    .refine((d) => Object.keys(d).length > 0, {
      message: 'At least one field must be provided',
    })
);

// ─── List query ─────────────────────────────────────────────────────────────

const csv = z
  .string()
  .optional()
  .transform((v) =>
    v
      ? v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined
  );

export const listOpeningsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  /** Matches opening code, job title or location. */
  search: z.string().trim().max(200).optional(),
  status: csv.pipe(z.array(openingStatusEnum).optional()),
  priority: csv.pipe(z.array(priorityEnum).optional()),
  employmentType: csv.pipe(z.array(employmentTypeEnum).optional()),
  workMode: csv.pipe(z.array(workModeEnum).optional()),
  visibility: visibilityEnum.optional(),
  hiringType: hiringTypeEnum.optional(),
  clientId: z.string().trim().max(64).optional(),
  projectId: z.string().trim().max(64).optional(),
  departmentId: z.string().trim().max(64).optional(),
  subDepartmentId: z.string().trim().max(64).optional(),
  hiringManagerId: z.string().trim().max(64).optional(),
  /** Openings this recruiter is assigned to. */
  recruiterId: z.string().trim().max(64).optional(),
  /**
   * Archived openings are finished work (Phase 7) and are hidden by default.
   * `only` is the archive view.
   */
  archived: z.enum(['exclude', 'include', 'only']).default('exclude'),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'jobTitle', 'priority', 'numberOfPositions', 'openingCode'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateOpeningInput = z.infer<typeof createOpeningSchema>;
export type UpdateOpeningInput = z.infer<typeof updateOpeningSchema>;
export type ListOpeningsQuery = z.infer<typeof listOpeningsQuerySchema>;
export type RecruiterInput = z.infer<typeof recruiterSchema>;
export type HiringTeamMemberInput = z.infer<typeof hiringTeamMemberSchema>;
export type RequiredDocumentInput = z.infer<typeof requiredDocumentSchema>;
