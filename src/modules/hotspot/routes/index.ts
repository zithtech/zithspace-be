// src/modules/hotspot/routes/index.ts
// Aggregates all Hotspot sub-routers under one mount point (/api/v2/hotspot).
// Tenant + auth middleware is applied here ONCE for the whole module, matching
// the platform convention (resolveTenant → authenticateToken → requireAuth),
// followed by the module's own moderation lookup.
//
// The Hotspot job board itself is served by /api/v2/openings — this module owns
// the pieces that are Hotspot-only, starting with Circulation.

import express from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { resolveModeration } from '../middleware/moderation';
import circulationRoutes from './circulation.routes';
import circulationAiRoutes from './circulationAi.routes';
import blogRoutes from './blog.routes';

const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);
router.use(resolveModeration);

// AI writing assist for the Circulation composer (stateless). Mounted apart
// from /circulation so its `/:id` routes can never swallow these.
router.use('/ai/circulation', circulationAiRoutes);

router.use('/circulation', circulationRoutes);
router.use('/blogs', blogRoutes);

export default router;
