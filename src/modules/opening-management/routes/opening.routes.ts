// src/modules/opening-management/routes/opening.routes.ts
// Routes for Openings. Auth/tenant middleware is applied once at the module
// router (see ./index.ts); here we only gate per-action permissions.

import express from 'express';
import { requirePermission, requireAnyPermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/opening.controller';
import { validateUuidParam } from '../http';

const router = express.Router();

router.param('id', validateUuidParam);

router.get(
  '/',
  requireAnyPermission(Permissions.OPENING_READ, Permissions.HOTSPOT_OPENING_READ),
  ctrl.list
);
router.get(
  '/:id',
  requireAnyPermission(Permissions.OPENING_READ, Permissions.HOTSPOT_OPENING_READ),
  ctrl.getOne
);
router.post('/', requirePermission(Permissions.OPENING_CREATE), ctrl.create);
router.put('/:id', requirePermission(Permissions.OPENING_UPDATE), ctrl.update);
router.delete('/:id', requirePermission(Permissions.OPENING_DELETE), ctrl.remove);

// Child collections — each PUT replaces the whole set for that opening.
router.put('/:id/recruiters', requirePermission(Permissions.OPENING_UPDATE), ctrl.setRecruiters);
router.put('/:id/hiring-team', requirePermission(Permissions.OPENING_UPDATE), ctrl.setHiringTeam);
router.put(
  '/:id/required-documents',
  requirePermission(Permissions.OPENING_UPDATE),
  ctrl.setRequiredDocuments
);

export default router;
