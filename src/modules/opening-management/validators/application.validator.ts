// src/modules/opening-management/validators/application.validator.ts
// Zod schemas for the Phase 5 candidate-intake endpoints.

import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const intakeSourceEnum = z.enum([
  'careers_page',
  'employee_referral',
  'internal_transfer',
  'internal_job_posting',
  'recruitment_agency',
  'linkedin',
  'naukri',
  'indeed',
  'manual_upload',
  'campus_hiring',
  'other',
]);

export const applicationStageEnum = z.enum([
  'applied',
  'screening',
  'shortlisted',
  'interview',
  'offer',
  'hired',
  'rejected',
  'withdrawn',
  'on_hold',
]);

export const createApplicationSchema = z
  .object({
    /** An existing candidates.id — this module never creates candidate records. */
    candidateId: z.string().trim().max(64).optional().nullable(),
    /**
     * A pipeline_candidates.id, for candidates added on /pipeline/candidates.
     * Exactly one of the two ids must be given.
     */
    pipelineCandidateId: z.string().trim().uuid().optional().nullable(),
    source: intakeSourceEnum,
    /** Agency name, campus, board campaign, or what "other" means. */
    sourceDetail: optionalText(200),
    /** users.id — required for employee referrals, matching the DB constraint. */
    referredBy: z.string().trim().max(64).optional().nullable(),
    resumeUrl: optionalText(1000),
    notes: optionalText(2000),
    /** Lets a bulk import land candidates mid-pipeline. Defaults to 'applied'. */
    stage: applicationStageEnum.default('applied'),
  })
  .refine((d) => !!d.candidateId !== !!d.pipelineCandidateId, {
    message: 'Give exactly one of candidateId or pipelineCandidateId',
    path: ['candidateId'],
  })
  .refine((d) => d.source !== 'employee_referral' || !!d.referredBy, {
    message: 'referredBy is required when the source is employee_referral',
    path: ['referredBy'],
  })
  .refine((d) => d.source !== 'other' || !!d.sourceDetail, {
    message: 'sourceDetail is required when the source is other',
    path: ['sourceDetail'],
  });

export const updateApplicationSchema = z
  .object({
    sourceDetail: optionalText(200),
    referredBy: z.string().trim().max(64).optional().nullable(),
    resumeUrl: optionalText(1000),
    notes: optionalText(2000),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  });

export const changeStageSchema = z
  .object({
    stage: applicationStageEnum,
    note: optionalText(1000),
    /** Required when moving to `rejected` — a rejection needs a reason on file. */
    rejectionReason: optionalText(500),
  })
  .refine((d) => d.stage !== 'rejected' || !!d.rejectionReason, {
    message: 'rejectionReason is required when rejecting a candidate',
    path: ['rejectionReason'],
  });

const csv = z
  .string()
  .optional()
  .transform((v) =>
    v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined
  );

export const listApplicationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  stage: csv.pipe(z.array(applicationStageEnum).optional()),
  source: csv.pipe(z.array(intakeSourceEnum).optional()),
  /** Matches candidate name or email. */
  search: z.string().trim().max(200).optional(),
});

export const skillMatchSchema = z.object({
  skills: z.array(z.string().trim().min(1).max(80)).max(100),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type SkillMatchInput = z.infer<typeof skillMatchSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
export type ChangeStageInput = z.infer<typeof changeStageSchema>;
export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>;
