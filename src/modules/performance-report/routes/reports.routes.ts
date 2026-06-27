// src/modules/performance-report/routes/reports.routes.ts
// Routes for the in-month performance report. Auth/tenant middleware is applied
// once at the module router (see ./index.ts); here we only gate per-action perms.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/reports.controller';

const router = express.Router();

// GET /api/performance-report/reports/tickets?from=&to=&projectId=&memberId=
router.get('/tickets', requirePermission(Permissions.PERFORMANCE_REPORT_READ), ctrl.tickets);

// GET /api/performance-report/reports/leaves?from=&to=&memberId=
router.get('/leaves', requirePermission(Permissions.PERFORMANCE_REPORT_READ), ctrl.leaves);

export default router;
