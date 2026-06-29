// src/modules/performance-report/routes/members.routes.ts
import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/members.controller';

const router = express.Router();

// GET /api/performance-report/members?page&limit&search&projectId
router.get('/', requirePermission(Permissions.PERFORMANCE_REPORT_READ), ctrl.list);

export default router;
