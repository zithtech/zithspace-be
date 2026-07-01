// src/modules/payroll/routes/payslipBank.routes.ts
// Routes for payslip template & bank settings. Auth/tenant middleware applied
// once at the module router; here we only gate per-action permissions.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/payslipBank.controller';

const router = express.Router();

router.get('/payslip-template', requirePermission(Permissions.PAYROLL_PAYSLIP_BANK_READ), ctrl.getTemplate);
router.put('/payslip-template', requirePermission(Permissions.PAYROLL_PAYSLIP_BANK_UPDATE), ctrl.updateTemplate);
router.post('/payslip-template/preview', requirePermission(Permissions.PAYROLL_PAYSLIP_BANK_READ), ctrl.previewTemplate);
router.post('/payslip-template/logo', requirePermission(Permissions.PAYROLL_PAYSLIP_BANK_UPDATE), ctrl.uploadLogo);
router.get('/bank-settings', requirePermission(Permissions.PAYROLL_PAYSLIP_BANK_READ), ctrl.getBank);
router.put('/bank-settings', requirePermission(Permissions.PAYROLL_PAYSLIP_BANK_UPDATE), ctrl.updateBank);

export default router;
