// src/modules/payroll/routes/payRun.routes.ts
// Routes for pay runs (Phase 3). Auth/tenant middleware applied once at the
// module router; here we gate per-action payroll perms.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/payRun.controller';

const router = express.Router();

router.get('/', requirePermission(Permissions.PAYROLL_RUN_READ), ctrl.list);
router.get('/:id', requirePermission(Permissions.PAYROLL_RUN_READ), ctrl.getOne);
router.post('/', requirePermission(Permissions.PAYROLL_RUN_CREATE), ctrl.create);
router.put('/:id/items/:itemId', requirePermission(Permissions.PAYROLL_RUN_PROCESS), ctrl.updateItem);
router.post('/:id/sync', requirePermission(Permissions.PAYROLL_RUN_PROCESS), ctrl.syncExternal);
router.post('/:id/submit', requirePermission(Permissions.PAYROLL_RUN_PROCESS), ctrl.submit);
router.post('/:id/process', requirePermission(Permissions.PAYROLL_RUN_APPROVE), ctrl.process);
router.post('/:id/finalize', requirePermission(Permissions.PAYROLL_RUN_FINALIZE), ctrl.finalize);
router.post('/:id/mark-paid', requirePermission(Permissions.PAYROLL_RUN_PAY), ctrl.markPaid);
router.get('/:id/payslips', requirePermission(Permissions.PAYROLL_RUN_READ), ctrl.listPayslips);
router.get('/:id/payslips/status', requirePermission(Permissions.PAYROLL_RUN_READ), ctrl.payslipStatus);
router.post('/:id/payslips', requirePermission(Permissions.PAYROLL_RUN_PAYSLIPS), ctrl.generatePayslips);
router.post('/:id/payslips/resume', requirePermission(Permissions.PAYROLL_RUN_PAYSLIPS), ctrl.resumePayslips);
router.get('/:id/bank-file', requirePermission(Permissions.PAYROLL_RUN_READ), ctrl.getBankFile);
router.post('/:id/bank-file', requirePermission(Permissions.PAYROLL_RUN_PAY), ctrl.generateBankFile);
router.delete('/:id', requirePermission(Permissions.PAYROLL_RUN_DELETE), ctrl.remove);

export default router;
