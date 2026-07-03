// src/modules/reimbursement-v2/routes/approval.routes.ts
// Manager approval routes. Gated by REIMBURSEMENT_APPROVE.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/approval.controller';

const router = express.Router();

router.get('/pending', requirePermission(Permissions.REIMBURSEMENT_APPROVE), ctrl.listPending);
router.get('/:id', requirePermission(Permissions.REIMBURSEMENT_APPROVE), ctrl.getOne);
router.post('/:id/approve', requirePermission(Permissions.REIMBURSEMENT_APPROVE), ctrl.approve);
router.post('/:id/reject', requirePermission(Permissions.REIMBURSEMENT_APPROVE), ctrl.reject);
router.post('/:id/send-back', requirePermission(Permissions.REIMBURSEMENT_APPROVE), ctrl.sendBack);

export default router;
