// src/modules/leave-v2/routes/leaveType.routes.ts
// Routes for Leave Types. Auth/tenant middleware is applied once at the module
// router (see ./index.ts); here we only gate per-action permissions.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/leaveType.controller';

const router = express.Router();

router.get('/', requirePermission(Permissions.LEAVE_TYPE_READ), ctrl.list);
router.get('/:id', requirePermission(Permissions.LEAVE_TYPE_READ), ctrl.getOne);
router.post('/', requirePermission(Permissions.LEAVE_TYPE_CREATE), ctrl.create);
router.put('/:id', requirePermission(Permissions.LEAVE_TYPE_UPDATE), ctrl.update);
router.delete('/:id', requirePermission(Permissions.LEAVE_TYPE_DELETE), ctrl.remove);

export default router;
