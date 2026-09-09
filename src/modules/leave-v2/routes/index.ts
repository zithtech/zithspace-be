// src/modules/leave-v2/routes/index.ts
// Aggregates all Leave 2.0 sub-routers under one mount point.
// Tenant + auth middleware is applied here ONCE for the whole module, matching
// the platform convention (resolveTenant → authenticateToken → requireAuth).

import express from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requireSubscriptionFeature } from '@/modules/entitlements/entitlements.middleware';
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

router.use('/types', requireSubscriptionFeature('hrms_leaves_v2_types', { exact: false }), leaveTypeRoutes);
router.use('/policies', requireSubscriptionFeature('hrms_leaves_v2_policy', { exact: false }), leavePolicyRoutes);
router.use('/accrual', requireSubscriptionFeature('hrms_leaves_v2_policy', { exact: false }), accrualRoutes);
router.use('/requests', requireSubscriptionFeature('hrms_leaves_v2_apply', { exact: false }), leaveRequestRoutes);
router.use('/approvals', requireSubscriptionFeature('hrms_leaves_v2_approvals', { exact: false }), approvalsRoutes);
router.use('/adjustments', requireSubscriptionFeature('hrms_leaves_v2_adjustment', { exact: false }), adjustmentRoutes);
router.use('/holidays', requireSubscriptionFeature('hrms_leaves_v2_holidays', { exact: false }), holidayRoutes);
router.use('/settings', requireSubscriptionFeature('hrms_leaves_v2_configuration', { exact: false }), leaveSettingsRoutes);
// Next slices mount here: /requests, /balances, /ledger

export default router;
