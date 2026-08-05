// src/modules/opening-management/routes/approval.routes.ts
// Per-opening approval actions.
//
// Permission note: the route gate is coarse (`opening.update` = "may take part
// in an approval"). WHO may decide a given step is a business rule, not an RBAC
// one, so it is enforced in the service against the resolved approver. Skipping
// an optional step is the exception — that is an admin act and gated here.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/approval.controller';
import { validateUuidParam } from '../http';

const router = express.Router();

router.param('id', validateUuidParam);

router.post('/:id/submit', requirePermission(Permissions.OPENING_UPDATE), ctrl.submit);
router.post('/:id/approve', requirePermission(Permissions.OPENING_UPDATE), ctrl.approve);
router.post('/:id/reject', requirePermission(Permissions.OPENING_UPDATE), ctrl.reject);
router.post('/:id/withdraw', requirePermission(Permissions.OPENING_UPDATE), ctrl.withdraw);
router.post('/:id/skip-step', requirePermission(Permissions.OPENING_MANAGE), ctrl.skip);
router.get('/:id/approvals', requirePermission(Permissions.OPENING_READ), ctrl.getTrail);

export default router;
