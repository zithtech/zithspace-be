// src/modules/opening-management/routes/closure.routes.ts
// Per-opening closing and archiving.
//
// Closing is `opening.update` — it is the recruiter's own act of finishing the
// work. Un-archiving is `opening.manage`: pulling finished work back into the
// live list is an administrative correction.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { requireSubscriptionFeature } from '@/modules/entitlements/entitlements.middleware';
import * as ctrl from '../controllers/closure.controller';
import { validateUuidParam } from '../http';

const router = express.Router();

router.param('id', validateUuidParam);

router.post('/:id/close', requirePermission(Permissions.OPENING_UPDATE), requireSubscriptionFeature('hrms_openings_closing', { exact: false }), ctrl.close);
router.post('/:id/archive', requirePermission(Permissions.OPENING_UPDATE), requireSubscriptionFeature('hrms_openings_archive', { exact: false }), ctrl.archive);
router.post('/:id/unarchive', requirePermission(Permissions.OPENING_MANAGE), requireSubscriptionFeature('hrms_openings_archive', { exact: false }), ctrl.unarchive);

export default router;
