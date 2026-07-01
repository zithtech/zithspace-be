// src/modules/payroll/routes/settings.routes.ts
// Routes for Payroll General Settings. Auth/tenant middleware is applied once at
// the module router (see ./index.ts); here we only gate per-action perms.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/settings.controller';

const router = express.Router();

router.get('/', requirePermission(Permissions.PAYROLL_SETTINGS_READ), ctrl.get);
router.put('/', requirePermission(Permissions.PAYROLL_SETTINGS_UPDATE), ctrl.update);

export default router;
