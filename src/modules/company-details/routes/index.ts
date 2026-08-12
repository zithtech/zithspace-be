// src/modules/company-details/routes/index.ts
// All Company Details endpoints under one mount point (/api/company-details).
// Tenant + auth middleware is applied here ONCE for the whole module, matching
// the platform convention (resolveTenant → authenticateToken → requireAuth).

import express from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { validateUuidParam } from '../http';
import * as ctrl from '../controllers/companyDetails.controller';

const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.param('id', validateUuidParam);

// ─── Company profile (one per tenant) ───────────────────────────────────────
router.get('/', requirePermission(Permissions.SETTINGS_READ), ctrl.getOverview);
router.get('/company', requirePermission(Permissions.SETTINGS_READ), ctrl.getCompany);
router.put('/company', requirePermission(Permissions.SETTINGS_UPDATE), ctrl.saveCompany);

// ─── Branch locations ───────────────────────────────────────────────────────
router.get('/branches', requirePermission(Permissions.SETTINGS_READ), ctrl.listBranches);
router.post('/branches', requirePermission(Permissions.SETTINGS_UPDATE), ctrl.createBranch);
router.get('/branches/:id', requirePermission(Permissions.SETTINGS_READ), ctrl.getBranch);
router.put('/branches/:id', requirePermission(Permissions.SETTINGS_UPDATE), ctrl.updateBranch);
router.delete('/branches/:id', requirePermission(Permissions.SETTINGS_DELETE), ctrl.deleteBranch);

export default router;
