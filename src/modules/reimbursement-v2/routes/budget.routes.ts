// src/modules/reimbursement-v2/routes/budget.routes.ts
// Budget routes. Managed by config permission; visible to dashboard readers.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/budget.controller';

const router = express.Router();

router.get('/', requirePermission(Permissions.REIMBURSEMENT_DASHBOARD_READ), ctrl.list);
router.get('/:id', requirePermission(Permissions.REIMBURSEMENT_DASHBOARD_READ), ctrl.getOne);
router.post('/', requirePermission(Permissions.REIMBURSEMENT_CONFIG_UPDATE), ctrl.create);
router.put('/:id', requirePermission(Permissions.REIMBURSEMENT_CONFIG_UPDATE), ctrl.update);
router.delete('/:id', requirePermission(Permissions.REIMBURSEMENT_CONFIG_UPDATE), ctrl.remove);

export default router;
