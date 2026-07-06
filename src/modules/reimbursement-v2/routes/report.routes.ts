// src/modules/reimbursement-v2/routes/report.routes.ts
// Read-only dashboard/analytics routes. Gated by REIMBURSEMENT_DASHBOARD_READ.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/report.controller';

const router = express.Router();

router.get('/summary', requirePermission(Permissions.REIMBURSEMENT_DASHBOARD_READ), ctrl.summary);
router.get('/by-category', requirePermission(Permissions.REIMBURSEMENT_DASHBOARD_READ), ctrl.byCategory);
router.get('/by-user', requirePermission(Permissions.REIMBURSEMENT_DASHBOARD_READ), ctrl.byUser);

export default router;
