// src/modules/opening-management/routes/index.ts
// Aggregates all Opening Management sub-routers under one mount point.
// Tenant + auth middleware is applied here ONCE for the whole module, matching
// the platform convention (resolveTenant → authenticateToken → requireAuth).
//
// ORDER MATTERS: the literal paths must be mounted before the opening router,
// whose `/:id` would otherwise swallow `/approval-workflows` and `/approvals`.

import express from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import approvalWorkflowRoutes from './approvalWorkflow.routes';
import approvalRoutes from './approval.routes';
import statusRoutes from './status.routes';
import postingRoutes from './posting.routes';
import applicationRoutes from './application.routes';
import referralRoutes from './referral.routes';
import dashboardRoutes from './dashboard.routes';
import aiAssistRoutes from './aiAssist.routes';
import closureRoutes from './closure.routes';
import * as closureCtrl from '../controllers/closure.controller';
import * as approvalCtrl from '../controllers/approval.controller';
import * as statusCtrl from '../controllers/status.controller';
import * as postingCtrl from '../controllers/posting.controller';
import * as applicationCtrl from '../controllers/application.controller';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import openingRoutes from './opening.routes';

const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// AI writing assist for the opening form (stateless).
router.use('/ai', aiAssistRoutes);

// Phase 6 — the hiring dashboard (read-only aggregation).
router.use('/dashboard', dashboardRoutes);

// Phase 7 — the closure catalog and the "ready to close" queue.
router.get(
  '/closure-reasons',
  requirePermission(Permissions.OPENING_READ),
  closureCtrl.reasons
);
router.get(
  '/closure-candidates',
  requirePermission(Permissions.OPENING_READ),
  closureCtrl.closureCandidates
);

// Phase 2 — approval configuration and the cross-opening approval queue.
router.use('/approval-workflows', approvalWorkflowRoutes);
router.get(
  '/approvals/pending',
  requirePermission(Permissions.OPENING_READ),
  approvalCtrl.listPending
);

// Phase 3 — lifecycle metadata that is not opening-specific.
router.get(
  '/status-catalog',
  requirePermission(Permissions.OPENING_READ),
  statusCtrl.catalog
);
router.get(
  '/status-summary',
  requirePermission(Permissions.OPENING_READ),
  statusCtrl.summary
);

// Phase 4 — tenant posting configuration and the manual sweep trigger.
router.get(
  '/posting-settings',
  requirePermission(Permissions.OPENING_READ),
  postingCtrl.getSettings
);
router.put(
  '/posting-settings',
  requirePermission(Permissions.OPENING_MANAGE),
  postingCtrl.updateSettings
);
router.post(
  '/postings/run-auto-move',
  requirePermission(Permissions.OPENING_MANAGE),
  postingCtrl.runAutoMove
);

// Phase 2 — per-opening approval actions (`/:id/submit`, `/:id/approve`, …).
router.use('/', approvalRoutes);

// Phase 3 — per-opening lifecycle actions (`/:id/status`, `/:id/hold`, …).
router.use('/', statusRoutes);

// Phase 5 — intake catalog and the cross-opening candidate view.
router.get(
  '/intake-catalog',
  requirePermission(Permissions.OPENING_READ),
  applicationCtrl.catalog
);
router.get(
  '/candidates/:candidateId/pipeline',
  requirePermission(Permissions.OPENING_READ),
  applicationCtrl.candidatePipeline
);

// Phase 4 — per-opening posting actions (`/:id/postings/internal`, …).
router.use('/', postingRoutes);

// Phase 5 — per-opening candidate intake (`/:id/applications`, …).
router.use('/', applicationRoutes);
router.use('/', referralRoutes);

// Phase 7 — per-opening closing and archiving (`/:id/close`, …).
router.use('/', closureRoutes);

// Phase 1 — opening CRUD. Last, because of its bare `/:id` routes.
router.use('/', openingRoutes);
// Later phases mount here: /:id/postings, /:id/candidates, /:id/metrics, /:id/close

export default router;
