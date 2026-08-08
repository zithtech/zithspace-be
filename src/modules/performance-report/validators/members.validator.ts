// src/modules/performance-report/validators/members.validator.ts
import { z } from 'zod';

export const memberListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
  search: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  positionId: z.string().trim().min(1).optional(),
  departmentId: z.string().trim().min(1).optional(),
});

export type MemberListQuery = z.infer<typeof memberListQuerySchema>;
