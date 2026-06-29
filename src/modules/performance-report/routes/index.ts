// src/modules/performance-report/routes/index.ts
// Aggregates all Performance Report sub-routers under one mount point.
// Tenant + auth middleware is applied here ONCE for the whole module, matching
// the platform convention (resolveTenant → authenticateToken → requireAuth).

import express from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import settingsRoutes from './settings.routes';
import reportsRoutes from './reports.routes';
import membersRoutes from './members.routes';
import generatedRoutes from './generated.routes';

const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.use('/settings', settingsRoutes);
router.use('/reports', reportsRoutes);
router.use('/members', membersRoutes);
router.use('/generated', generatedRoutes);
// Next slices mount here: /generated (archive)

export default router;
