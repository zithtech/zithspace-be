// src/modules/performance-report/routes/generated.routes.ts
import express from 'express';
import { requirePermission, requireAnyPermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/generated.controller';

const router = express.Router();

// My Reports — a user's own reports (returns only the caller's).
router.get('/mine', requireAnyPermission(Permissions.PERFORMANCE_REPORT_MY_READ, Permissions.MY_HUB_PERFORMANCE_READ), ctrl.mine);
router.get('/', requirePermission(Permissions.PERFORMANCE_REPORT_GENERATED_READ), ctrl.list);
router.post('/', requirePermission(Permissions.PERFORMANCE_REPORT_SETTING_UPDATE), ctrl.save);
router.delete('/:id', requirePermission(Permissions.PERFORMANCE_REPORT_SETTING_UPDATE), ctrl.remove);

export default router;
