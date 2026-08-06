// src/modules/opening-management/routes/dashboard.routes.ts
// Phase 6 hiring dashboard. All read-only, all gated on `opening.read`.
//
// Mounted under /dashboard so none of these paths can collide with the
// opening router's `/:id`.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/dashboard.controller';

const router = express.Router();

router.use(requirePermission(Permissions.OPENING_READ));

// Everything the landing page needs, consistent with itself, in one request.
router.get('/', ctrl.overview);

// The individual panels, for drill-down and refresh.
router.get('/summary', ctrl.summary);
router.get('/openings', ctrl.openings);
router.get('/sources', ctrl.sources);
router.get('/velocity', ctrl.velocity);
router.get('/recruiters', ctrl.recruiters);

export default router;
