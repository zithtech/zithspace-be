// src/modules/opening-management/routes/aiAssist.routes.ts
// AI writing assist for the opening form.
//
// Gated on `opening.create` — these endpoints only help compose an opening, and
// anyone allowed to create one may use them. `requireAiAccess` then honours the
// per-user AI toggle, the same as every other AI feature on the platform.

import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { requireAiAccess } from '@/middleware/aiAccess';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/aiAssist.controller';

const router = express.Router();

router.use(requirePermission(Permissions.OPENING_CREATE));
router.use(requireAiAccess);

router.post('/grammar', ctrl.grammar);
router.post('/suggestions', ctrl.suggest);
router.post('/enhance', ctrl.enhance);

export default router;
