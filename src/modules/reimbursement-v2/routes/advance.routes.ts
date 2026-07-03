// src/modules/reimbursement-v2/routes/advance.routes.ts
// Cash-advance routes: self-service + manager (approve) + finance (pay/reconcile).
// Static paths (/pending, /payable) are declared before /:id so they match first.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/advance.controller';

const router = express.Router();

// manager + finance queues (before /:id)
router.get('/pending', requirePermission(Permissions.REIMBURSEMENT_APPROVE), ctrl.listPending);
router.get('/payable', requirePermission(Permissions.REIMBURSEMENT_PAY), ctrl.listPayable);

// self-service
router.get('/', requirePermission(Permissions.REIMBURSEMENT_READ), ctrl.listMine);
router.post('/', requirePermission(Permissions.REIMBURSEMENT_CREATE), ctrl.request);
router.get('/:id', requirePermission(Permissions.REIMBURSEMENT_READ), ctrl.getMine);
router.post('/:id/cancel', requirePermission(Permissions.REIMBURSEMENT_READ), ctrl.cancel);

// manager decisions
router.post('/:id/approve', requirePermission(Permissions.REIMBURSEMENT_APPROVE), ctrl.approve);
router.post('/:id/reject', requirePermission(Permissions.REIMBURSEMENT_APPROVE), ctrl.reject);

// finance
router.post('/:id/mark-paid', requirePermission(Permissions.REIMBURSEMENT_PAY), ctrl.markPaid);
router.post('/:id/reconcile', requirePermission(Permissions.REIMBURSEMENT_PAY), ctrl.reconcile);

export default router;
