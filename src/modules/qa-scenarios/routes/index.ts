// src/modules/qa-scenarios/routes/index.ts
//
// All Test Scenario endpoints under one mount point (/api/v2/qa/scenarios).
//
// MOUNT ORDER MATTERS: this router must be registered in app.ts BEFORE
// `app.use("/api/v2/qa", testCaseRoutes)`, because that router claims "/:id"
// and would otherwise read "scenarios" as a test case id — the same hazard the
// playbooks and submissions mounts already warn about.
//
// PERMISSIONS: grouping cases is an edit to how the module's cases are
// organised, so it rides the test-case grants rather than inventing its own —
// read to see the flows, create to name one, update to map or reorder, delete
// to ungroup.

import express from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requireAnyPermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as scenarios from '../controllers/scenario.controller';

const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

const canRead = requireAnyPermission(Permissions.QA_CASE_READ, Permissions.QA_MANAGE);
const canCreate = requireAnyPermission(Permissions.QA_CASE_CREATE, Permissions.QA_MANAGE);
const canUpdate = requireAnyPermission(Permissions.QA_CASE_UPDATE, Permissions.QA_MANAGE);
const canDelete = requireAnyPermission(Permissions.QA_CASE_DELETE, Permissions.QA_MANAGE);

// Literal segments before "/:id", or Express reads "reorder" as a scenario id.
router.put('/reorder', canUpdate, scenarios.reorder);
// Same reason: "for-cases" is a lookup, not an id.
router.get('/for-cases', canRead, scenarios.forCases);

router.get('/', canRead, scenarios.list);
router.post('/', canCreate, scenarios.create);
router.get('/:id', canRead, scenarios.get);
router.put('/:id', canUpdate, scenarios.update);
router.delete('/:id', canDelete, scenarios.remove);

// Mapping and ordering the cases inside a flow.
router.put('/:id/cases', canUpdate, scenarios.setCases);
router.post('/:id/cases', canUpdate, scenarios.addCases);
router.delete('/:id/cases/:caseId', canUpdate, scenarios.removeCase);

export default router;
