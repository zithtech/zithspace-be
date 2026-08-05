// src/modules/opening-management/validators/dashboard.validator.ts
// Zod schemas for the Phase 6 dashboard queries. Every endpoint takes the same
// filter set, so a user can narrow the whole dashboard once and have each panel
// agree with the others.

import { z } from 'zod';
import {
  employmentTypeEnum,
  openingStatusEnum,
  priorityEnum,
} from './opening.validator';

const csv = z
  .string()
  .optional()
  .transform((v) =>
    v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined
  );

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
  .optional();

export const dashboardFilterSchema = z.object({
  status: csv.pipe(z.array(openingStatusEnum).optional()),
  priority: csv.pipe(z.array(priorityEnum).optional()),
  employmentType: csv.pipe(z.array(employmentTypeEnum).optional()),
  departmentId: z.string().trim().max(64).optional(),
  clientId: z.string().trim().max(64).optional(),
  projectId: z.string().trim().max(64).optional(),
  hiringManagerId: z.string().trim().max(64).optional(),
  recruiterId: z.string().trim().max(64).optional(),
  /** On the opening's creation date. */
  dateFrom: isoDate,
  dateTo: isoDate,
  search: z.string().trim().max(200).optional(),
  /**
   * Cancelled and closed openings are excluded by default — a hiring dashboard
   * is about work in flight. Pass `true` for historical reporting.
   */
  includeClosed: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const dashboardListQuerySchema = dashboardFilterSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sortBy: z
    .enum(['createdAt', 'applications', 'joined', 'openPositions', 'ageDays', 'jobTitle', 'priority'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type DashboardFilterQuery = z.infer<typeof dashboardFilterSchema>;
export type DashboardListQuery = z.infer<typeof dashboardListQuerySchema>;
