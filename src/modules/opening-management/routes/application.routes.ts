// src/modules/opening-management/routes/application.routes.ts
// Per-opening candidate intake and pipeline.

import express from 'express';
import { requirePermission, requireAnyPermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/application.controller';
import { validateUuidParam } from '../http';

const router = express.Router();

router.param('id', validateUuidParam);
router.param('applicationId', validateUuidParam);

router.get('/:id/applications', requirePermission(Permissions.OPENING_READ), ctrl.list);
router.get('/:id/applications/funnel', requirePermission(Permissions.OPENING_READ), ctrl.funnel);
router.get(
  '/:id/applications/:applicationId',
  requirePermission(Permissions.OPENING_READ),
  ctrl.getOne
);
router.post(
  '/:id/applications',
  requireAnyPermission(Permissions.OPENING_UPDATE, Permissions.HOTSPOT_OPENING_CREATE),
  ctrl.create
);
// Read-only scoring, so `opening.read` is the right gate — you do not have to be
// able to edit an opening to see how well someone fits it.
router.post('/:id/skill-match', requirePermission(Permissions.OPENING_READ), ctrl.skillMatch);
router.put(
  '/:id/applications/:applicationId',
  requirePermission(Permissions.OPENING_UPDATE),
  ctrl.update
);
router.post(
  '/:id/applications/:applicationId/stage',
  requirePermission(Permissions.OPENING_UPDATE),
  ctrl.changeStage
);
router.delete(
  '/:id/applications/:applicationId',
  requirePermission(Permissions.OPENING_UPDATE),
  ctrl.remove
);

export default router;
