// src/modules/hotspot/routes/circulationAi.routes.ts
// AI writing assist for the Circulation composer.
//
// No permission gate beyond the module's own auth: anyone who may post an
// update may get help writing it. `requireAiAccess` then honours the per-user
// AI toggle, the same as every other AI feature on the platform.

import express from 'express';
import { requireAiAccess } from '@/middleware/aiAccess';
import * as ctrl from '../controllers/circulationAi.controller';

const router = express.Router();

router.use(requireAiAccess);

router.post('/compose', ctrl.compose);
router.post('/grammar', ctrl.grammar);

export default router;
