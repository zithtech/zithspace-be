// src/modules/leave-v2/routes/adjustment.routes.ts
import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/adjustment.controller';

const router = express.Router();

router.get('/', requirePermission(Permissions.LEAVE_ADJUSTMENT_READ), ctrl.list);
router.get('/employees', requirePermission(Permissions.LEAVE_ADJUSTMENT_READ), ctrl.employees);
router.get('/balance', requirePermission(Permissions.LEAVE_ADJUSTMENT_READ), ctrl.balance);
router.post('/', requirePermission(Permissions.LEAVE_ADJUSTMENT_CREATE), ctrl.create);
router.delete('/:id', requirePermission(Permissions.LEAVE_ADJUSTMENT_DELETE), ctrl.remove);

export default router;
