// src/modules/payroll/routes/schedule.routes.ts
// Routes for Pay Schedules. Auth/tenant middleware applied once at the module
// router; here we only gate per-action permissions (PAYROLL_SETTING_*).

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/schedule.controller';

const router = express.Router();

router.get('/', requirePermission(Permissions.PAYROLL_SCHEDULES_READ), ctrl.listSchedules);
router.get('/:id', requirePermission(Permissions.PAYROLL_SCHEDULES_READ), ctrl.getSchedule);
router.post('/', requirePermission(Permissions.PAYROLL_SCHEDULES_CREATE), ctrl.createSchedule);
router.put('/:id', requirePermission(Permissions.PAYROLL_SCHEDULES_UPDATE), ctrl.updateSchedule);
router.delete('/:id', requirePermission(Permissions.PAYROLL_SCHEDULES_DELETE), ctrl.removeSchedule);

export default router;
