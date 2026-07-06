// src/modules/reimbursement-v2/routes/index.ts
// Aggregates all Reimbursement 2.0 sub-routers under one mount point.
// Tenant + auth middleware is applied here ONCE for the whole module, matching
// the platform convention (resolveTenant → authenticateToken → requireAuth).

import express from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import categoryRoutes from './category.routes';
import policyRoutes from './policy.routes';
import claimRoutes from './claim.routes';
import advanceRoutes from './advance.routes';
import approvalRoutes from './approval.routes';
import financeRoutes from './finance.routes';
import budgetRoutes from './budget.routes';
import reportRoutes from './report.routes';

const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.use('/categories', categoryRoutes);
router.use('/policies', policyRoutes);
router.use('/claims', claimRoutes);
router.use('/advances', advanceRoutes);
router.use('/approvals', approvalRoutes);
router.use('/finance', financeRoutes);
router.use('/budgets', budgetRoutes);
router.use('/reports', reportRoutes);

export default router;
