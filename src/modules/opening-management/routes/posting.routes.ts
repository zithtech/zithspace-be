// src/modules/opening-management/routes/posting.routes.ts
// Per-opening posting actions.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/posting.controller';
import { validateUuidParam } from '../http';

const router = express.Router();

router.param('id', validateUuidParam);
router.param('postingId', validateUuidParam);

router.get('/:id/postings', requirePermission(Permissions.OPENING_READ), ctrl.list);
router.post(
  '/:id/postings/internal',
  requirePermission(Permissions.OPENING_UPDATE),
  ctrl.postInternal
);
router.post(
  '/:id/postings/external',
  requirePermission(Permissions.OPENING_UPDATE),
  ctrl.postExternal
);
router.post(
  '/:id/postings/:postingId/close',
  requirePermission(Permissions.OPENING_UPDATE),
  ctrl.close
);

export default router;
