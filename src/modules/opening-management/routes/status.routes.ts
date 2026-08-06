// src/modules/opening-management/routes/status.routes.ts
// Per-opening lifecycle actions.
//
// The route gate is `opening.update` throughout: WHICH transitions a caller may
// make is a business rule (some need `opening.manage`) and is enforced in the
// service against the transition map, not here.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/status.controller';
import { validateUuidParam } from '../http';

const router = express.Router();

router.param('id', validateUuidParam);

router.get('/:id/status', requirePermission(Permissions.OPENING_READ), ctrl.getState);
router.get('/:id/status-history', requirePermission(Permissions.OPENING_READ), ctrl.getHistory);
router.post('/:id/status', requirePermission(Permissions.OPENING_UPDATE), ctrl.changeStatus);
router.post('/:id/hold', requirePermission(Permissions.OPENING_UPDATE), ctrl.hold);
router.post('/:id/resume', requirePermission(Permissions.OPENING_UPDATE), ctrl.resume);

export default router;
