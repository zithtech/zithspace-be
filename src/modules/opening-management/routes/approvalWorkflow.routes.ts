// src/modules/opening-management/routes/approvalWorkflow.routes.ts
// Tenant-level approval templates. Reading one is part of the normal opening
// experience; changing the chain is an admin action (`opening.manage`).

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/approvalWorkflow.controller';
import { validateUuidParam } from '../http';

const router = express.Router();

router.param('workflowId', validateUuidParam);

router.get('/', requirePermission(Permissions.OPENING_READ), ctrl.list);
router.get('/:workflowId', requirePermission(Permissions.OPENING_READ), ctrl.getOne);
router.post('/', requirePermission(Permissions.OPENING_MANAGE), ctrl.create);
router.put('/:workflowId', requirePermission(Permissions.OPENING_MANAGE), ctrl.update);
router.delete('/:workflowId', requirePermission(Permissions.OPENING_MANAGE), ctrl.remove);

export default router;
