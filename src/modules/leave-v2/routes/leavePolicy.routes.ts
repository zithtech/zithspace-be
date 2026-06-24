// src/modules/leave-v2/routes/leavePolicy.routes.ts
// Routes for Leave Policies. Auth/tenant middleware applied at the module router.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/leavePolicy.controller';

const router = express.Router();

router.get('/', requirePermission(Permissions.LEAVE_POLICY_READ), ctrl.list);
router.get('/:id', requirePermission(Permissions.LEAVE_POLICY_READ), ctrl.getOne);
router.post('/', requirePermission(Permissions.LEAVE_POLICY_CREATE), ctrl.create);
router.put('/:id', requirePermission(Permissions.LEAVE_POLICY_UPDATE), ctrl.update);
router.delete('/:id', requirePermission(Permissions.LEAVE_POLICY_DELETE), ctrl.remove);

export default router;
