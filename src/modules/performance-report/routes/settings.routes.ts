// src/modules/performance-report/routes/settings.routes.ts
// Routes for Performance Report Settings. Auth/tenant middleware is applied once
// at the module router (see ./index.ts); here we only gate per-action perms.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/settings.controller';

const router = express.Router();

router.get('/', requirePermission(Permissions.PERFORMANCE_REPORT_SETTING_READ), ctrl.get);
router.get('/catalog', requirePermission(Permissions.PERFORMANCE_REPORT_SETTING_READ), ctrl.catalog);
router.get('/ticket-statuses', requirePermission(Permissions.PERFORMANCE_REPORT_SETTING_READ), ctrl.ticketStatuses);
router.put('/', requirePermission(Permissions.PERFORMANCE_REPORT_SETTING_UPDATE), ctrl.update);

export default router;
