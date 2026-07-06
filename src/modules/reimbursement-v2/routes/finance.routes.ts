// src/modules/reimbursement-v2/routes/finance.routes.ts
// Finance settlement routes. Gated by REIMBURSEMENT_PAY.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/finance.controller';

const router = express.Router();

router.get('/payable', requirePermission(Permissions.REIMBURSEMENT_PAY), ctrl.listPayable);
router.get('/:id', requirePermission(Permissions.REIMBURSEMENT_PAY), ctrl.getOne);
router.post('/:id/mark-paid', requirePermission(Permissions.REIMBURSEMENT_PAY), ctrl.markPaid);

export default router;
