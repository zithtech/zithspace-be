// src/modules/reimbursement-v2/routes/policy.routes.ts
// Routes for Reimbursement Policies. Auth/tenant middleware applied once at the
// module router (see ./index.ts); here we only gate per-action permissions.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/policy.controller';

const router = express.Router();

router.get('/', requirePermission(Permissions.REIMBURSEMENT_CONFIG_READ), ctrl.list);
router.get('/:id', requirePermission(Permissions.REIMBURSEMENT_CONFIG_READ), ctrl.getOne);
router.post('/', requirePermission(Permissions.REIMBURSEMENT_CONFIG_UPDATE), ctrl.create);
router.put('/:id', requirePermission(Permissions.REIMBURSEMENT_CONFIG_UPDATE), ctrl.update);
router.delete('/:id', requirePermission(Permissions.REIMBURSEMENT_CONFIG_UPDATE), ctrl.remove);

export default router;
