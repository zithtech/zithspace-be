// src/modules/payroll/routes/structure.routes.ts
// Routes for Salary Structures. Auth/tenant middleware is applied once at the
// module router (see ./index.ts); here we only gate per-action permissions.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/structure.controller';

const router = express.Router();

router.get('/', requirePermission(Permissions.PAYROLL_STRUCTURES_READ), ctrl.list);
router.post('/preview', requirePermission(Permissions.PAYROLL_STRUCTURES_READ), ctrl.preview);
router.get('/:id', requirePermission(Permissions.PAYROLL_STRUCTURES_READ), ctrl.getOne);
router.post('/', requirePermission(Permissions.PAYROLL_STRUCTURES_CREATE), ctrl.create);
router.put('/:id', requirePermission(Permissions.PAYROLL_STRUCTURES_UPDATE), ctrl.update);
router.delete('/:id', requirePermission(Permissions.PAYROLL_STRUCTURES_DELETE), ctrl.remove);

export default router;
