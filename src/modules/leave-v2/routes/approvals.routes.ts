// src/modules/leave-v2/routes/approvals.routes.ts
import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/approvals.controller';

const router = express.Router();

router.get('/', requirePermission(Permissions.LEAVE_APPROVE), ctrl.list);
router.post('/:id/approve', requirePermission(Permissions.LEAVE_APPROVE), ctrl.approve);
router.post('/:id/reject', requirePermission(Permissions.LEAVE_APPROVE), ctrl.reject);
router.post('/:id/withdraw-decision', requirePermission(Permissions.LEAVE_APPROVE), ctrl.withdrawDecision);

export default router;
