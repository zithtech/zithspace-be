// src/modules/leave-v2/routes/leaveRequest.routes.ts
// Self-service leave (the caller's own requests + balances).

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/leaveRequest.controller';

const router = express.Router();

router.get('/balances', requirePermission(Permissions.LEAVE_READ), ctrl.myBalances);
router.get('/mine', requirePermission(Permissions.LEAVE_READ), ctrl.myRequests);
router.get('/holidays', requirePermission(Permissions.LEAVE_READ), ctrl.holidayDates);
router.post('/', requirePermission(Permissions.LEAVE_CREATE), ctrl.apply);
router.put('/:id', requirePermission(Permissions.LEAVE_UPDATE), ctrl.update);
router.post('/:id/cancel', requirePermission(Permissions.LEAVE_READ), ctrl.cancel);

export default router;
