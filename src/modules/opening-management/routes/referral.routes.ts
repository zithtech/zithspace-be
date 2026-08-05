import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/referral.controller';
import { validateUuidParam } from '../http';

const router = express.Router();

router.param('id', validateUuidParam);
router.param('refId', validateUuidParam);

router.post('/:id/referrals', requirePermission(Permissions.OPENING_UPDATE), ctrl.createReferral);
router.get('/:id/referrals', requirePermission(Permissions.OPENING_READ), ctrl.listReferrals);
router.post('/:id/referrals/:refId/convert', requirePermission(Permissions.OPENING_UPDATE), ctrl.markConverted);
router.delete('/:id/referrals/:refId', requirePermission(Permissions.OPENING_UPDATE), ctrl.deleteReferral);

export default router;
