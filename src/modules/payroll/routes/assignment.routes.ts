// src/modules/payroll/routes/assignment.routes.ts
// Routes for employee salary assignments (Phase 2). Auth/tenant middleware
// applied once at the module router; here we gate per-action payroll perms.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/assignment.controller';

const router = express.Router();

router.get('/assignments', requirePermission(Permissions.PAYROLL_EMPLOYEES_READ), ctrl.list);
router.post('/assignments/preview', requirePermission(Permissions.PAYROLL_EMPLOYEES_READ), ctrl.preview);
router.get('/assignments/:employeeId/history', requirePermission(Permissions.PAYROLL_EMPLOYEES_READ), ctrl.getHistory);
router.get('/assignments/:employeeId', requirePermission(Permissions.PAYROLL_EMPLOYEES_READ), ctrl.getForEmployee);
router.post('/assignments', requirePermission(Permissions.PAYROLL_EMPLOYEES_CREATE), ctrl.assign);
router.delete('/assignments/:id', requirePermission(Permissions.PAYROLL_EMPLOYEES_DELETE), ctrl.revoke);

// Statutory & bank profiles
router.get('/profiles', requirePermission(Permissions.PAYROLL_EMPLOYEES_READ), ctrl.listProfiles);
router.get('/profiles/:employeeId', requirePermission(Permissions.PAYROLL_EMPLOYEES_READ), ctrl.getProfile);
router.put('/profiles/:employeeId', requirePermission(Permissions.PAYROLL_EMPLOYEES_UPDATE), ctrl.upsertProfile);

export default router;
