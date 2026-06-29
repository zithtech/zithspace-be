// src/modules/performance-report/validators/reports.validator.ts
// Zod schema for the in-month report query params.

import { z } from 'zod';

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

export const ticketReportQuerySchema = z
  .object({
    from: dateOnly,
    to: dateOnly,
    projectId: z.string().trim().min(1).optional(),
    memberId: z.string().trim().min(1).optional(),
  })
  .refine((q) => q.from <= q.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });

export type TicketReportQuery = z.infer<typeof ticketReportQuerySchema>;

export const leaveReportQuerySchema = z
  .object({
    from: dateOnly,
    to: dateOnly,
    memberId: z.string().trim().min(1).optional(),
  })
  .refine((q) => q.from <= q.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });

export type LeaveReportQuery = z.infer<typeof leaveReportQuerySchema>;
