// src/modules/payroll/routes/reports.routes.ts
// Routes for payroll reports. Auth/tenant middleware applied once at the module
// router; read-only, gated by PAYROLL_REPORTS_READ.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/reports.controller';

const router = express.Router();

router.get('/register', requirePermission(Permissions.PAYROLL_REPORTS_READ), ctrl.register);

export default router;
