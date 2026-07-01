// src/modules/payroll/routes/group.routes.ts
// Routes for Pay Groups. Auth/tenant middleware applied once at the module
// router; here we only gate per-action permissions (PAYROLL_SETTING_*).

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/schedule.controller';

const router = express.Router();

router.get('/', requirePermission(Permissions.PAYROLL_SCHEDULES_READ), ctrl.listGroups);
router.get('/:id', requirePermission(Permissions.PAYROLL_SCHEDULES_READ), ctrl.getGroup);
router.post('/', requirePermission(Permissions.PAYROLL_SCHEDULES_CREATE), ctrl.createGroup);
router.put('/:id', requirePermission(Permissions.PAYROLL_SCHEDULES_UPDATE), ctrl.updateGroup);
router.delete('/:id', requirePermission(Permissions.PAYROLL_SCHEDULES_DELETE), ctrl.removeGroup);

export default router;
