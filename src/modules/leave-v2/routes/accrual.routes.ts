// src/modules/leave-v2/routes/accrual.routes.ts
// Accrual settings + manual run. Auth/tenant middleware applied at module router.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/accrual.controller';

const router = express.Router();

router.get('/settings', requirePermission(Permissions.LEAVE_POLICY_READ), ctrl.getSettings);
router.put('/settings', requirePermission(Permissions.LEAVE_MANAGE), ctrl.updateSettings);
router.post('/run', requirePermission(Permissions.LEAVE_MANAGE), ctrl.run);

export default router;
