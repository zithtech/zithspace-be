// src/modules/payroll/routes/statutory.routes.ts
// Routes for statutory PF & ESI config. Auth/tenant middleware applied once at
// the module router; here we only gate per-action permissions.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/statutory.controller';
import * as stateCtrl from '../controllers/statutoryState.controller';

const router = express.Router();

// PF / ESI (single-row config) — "Statutory" page
router.get('/pf', requirePermission(Permissions.PAYROLL_STATUTORY_READ), ctrl.getPf);
router.put('/pf', requirePermission(Permissions.PAYROLL_STATUTORY_UPDATE), ctrl.updatePf);
router.get('/esi', requirePermission(Permissions.PAYROLL_STATUTORY_READ), ctrl.getEsi);
router.put('/esi', requirePermission(Permissions.PAYROLL_STATUTORY_UPDATE), ctrl.updateEsi);

// Professional Tax (state + slabs) — "Professional Tax & LWF" page
router.get('/pt', requirePermission(Permissions.PAYROLL_STATE_STATUTORY_READ), stateCtrl.listPt);
router.get('/pt/:id', requirePermission(Permissions.PAYROLL_STATE_STATUTORY_READ), stateCtrl.getPt);
router.post('/pt', requirePermission(Permissions.PAYROLL_STATE_STATUTORY_CREATE), stateCtrl.createPt);
router.put('/pt/:id', requirePermission(Permissions.PAYROLL_STATE_STATUTORY_UPDATE), stateCtrl.updatePt);
router.delete('/pt/:id', requirePermission(Permissions.PAYROLL_STATE_STATUTORY_DELETE), stateCtrl.removePt);

// LWF (per state) — "Professional Tax & LWF" page
router.get('/lwf', requirePermission(Permissions.PAYROLL_STATE_STATUTORY_READ), stateCtrl.listLwf);
router.post('/lwf', requirePermission(Permissions.PAYROLL_STATE_STATUTORY_CREATE), stateCtrl.createLwf);
router.put('/lwf/:id', requirePermission(Permissions.PAYROLL_STATE_STATUTORY_UPDATE), stateCtrl.updateLwf);
router.delete('/lwf/:id', requirePermission(Permissions.PAYROLL_STATE_STATUTORY_DELETE), stateCtrl.removeLwf);

export default router;
