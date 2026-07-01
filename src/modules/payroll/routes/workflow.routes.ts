// src/modules/payroll/routes/workflow.routes.ts
// Routes for approval workflows. Auth/tenant middleware applied once at the
// module router; here we only gate per-action permissions.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/workflow.controller';

const router = express.Router();

router.get('/', requirePermission(Permissions.PAYROLL_WORKFLOWS_READ), ctrl.list);
router.get('/:id', requirePermission(Permissions.PAYROLL_WORKFLOWS_READ), ctrl.getOne);
router.post('/', requirePermission(Permissions.PAYROLL_WORKFLOWS_CREATE), ctrl.create);
router.put('/:id', requirePermission(Permissions.PAYROLL_WORKFLOWS_UPDATE), ctrl.update);
router.delete('/:id', requirePermission(Permissions.PAYROLL_WORKFLOWS_DELETE), ctrl.remove);

export default router;
