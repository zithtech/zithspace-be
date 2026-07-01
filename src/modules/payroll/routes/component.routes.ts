// src/modules/payroll/routes/component.routes.ts
// Routes for Salary Components. Auth/tenant middleware is applied once at the
// module router (see ./index.ts); here we only gate per-action permissions.
// Components are payroll configuration, so they reuse the PAYROLL_SETTING_* perms.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/component.controller';

const router = express.Router();

router.get('/', requirePermission(Permissions.PAYROLL_COMPONENTS_READ), ctrl.list);
router.get('/:id', requirePermission(Permissions.PAYROLL_COMPONENTS_READ), ctrl.getOne);
router.post('/', requirePermission(Permissions.PAYROLL_COMPONENTS_CREATE), ctrl.create);
router.put('/:id', requirePermission(Permissions.PAYROLL_COMPONENTS_UPDATE), ctrl.update);
router.delete('/:id', requirePermission(Permissions.PAYROLL_COMPONENTS_DELETE), ctrl.remove);

export default router;
