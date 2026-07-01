// src/modules/payroll/routes/index.ts
// Aggregates all Payroll 2.0 sub-routers under one mount point (/api/v2/payroll).
// Tenant + auth middleware is applied here ONCE for the whole module, matching
// the platform convention (resolveTenant → authenticateToken → requireAuth).

import express from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import settingsRoutes from './settings.routes';
import componentRoutes from './component.routes';
import structureRoutes from './structure.routes';
import scheduleRoutes from './schedule.routes';
import groupRoutes from './group.routes';
import statutoryRoutes from './statutory.routes';
import workflowRoutes from './workflow.routes';
import payslipBankRoutes from './payslipBank.routes';
import assignmentRoutes from './assignment.routes';
import payRunRoutes from './payRun.routes';
import reportsRoutes from './reports.routes';
import selfServiceRoutes from './selfService.routes';

const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.use('/settings', settingsRoutes);
router.use('/components', componentRoutes);
router.use('/structures', structureRoutes);
router.use('/schedules', scheduleRoutes);
router.use('/groups', groupRoutes);
router.use('/statutory', statutoryRoutes);
router.use('/workflows', workflowRoutes);
router.use('/', payslipBankRoutes); // /payslip-template, /bank-settings
// ── Phase 2 — Employee Pay Setup ──
router.use('/employees', assignmentRoutes); // /employees/assignments …
// ── Phase 3 — Run Payroll ──
router.use('/runs', payRunRoutes);
// ── Phase 6 — Reports & Compliance ──
router.use('/reports', reportsRoutes);
// ── Phase 5 — Employee Self-Service ──
router.use('/', selfServiceRoutes); // /my-payslips

export default router;
