// src/modules/performance-report/routes/index.ts
// Aggregates all Performance Report sub-routers under one mount point.
// Tenant + auth middleware is applied here ONCE for the whole module, matching
// the platform convention (resolveTenant → authenticateToken → requireAuth).

import express from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requireSubscriptionFeature } from '@/modules/entitlements/entitlements.middleware';
import settingsRoutes from './settings.routes';
import reportsRoutes from './reports.routes';
import membersRoutes from './members.routes';
import generatedRoutes from './generated.routes';

const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.use('/settings', requireSubscriptionFeature('hrms_performance_report_settings', { exact: false }), settingsRoutes);
router.use('/reports', requireSubscriptionFeature('hrms_performance_report_reports', { exact: false }), reportsRoutes);
router.use('/members', requireSubscriptionFeature('hrms_performance_report_reports', { exact: false }), membersRoutes);
router.use('/generated', requireSubscriptionFeature(['hrms_performance_report_generated', 'hrms_performance_report_my_reports', 'my_hub_my_hub_general_performance'], { exact: false }), generatedRoutes);
// Next slices mount here: /generated (archive)

export default router;
