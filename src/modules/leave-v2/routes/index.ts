// src/modules/leave-v2/routes/index.ts
// Aggregates all Leave 2.0 sub-routers under one mount point.
// Tenant + auth middleware is applied here ONCE for the whole module, matching
// the platform convention (resolveTenant → authenticateToken → requireAuth).

import express from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import leaveTypeRoutes from './leaveType.routes';
import leavePolicyRoutes from './leavePolicy.routes';
import accrualRoutes from './accrual.routes';
import leaveRequestRoutes from './leaveRequest.routes';
import approvalsRoutes from './approvals.routes';
import adjustmentRoutes from './adjustment.routes';
import holidayRoutes from './holiday.routes';
import leaveSettingsRoutes from './leaveSettings.routes';

const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.use('/types', leaveTypeRoutes);
router.use('/policies', leavePolicyRoutes);
router.use('/accrual', accrualRoutes);
router.use('/requests', leaveRequestRoutes);
router.use('/approvals', approvalsRoutes);
router.use('/adjustments', adjustmentRoutes);
router.use('/holidays', holidayRoutes);
router.use('/settings', leaveSettingsRoutes);
// Next slices mount here: /requests, /balances, /ledger

export default router;
