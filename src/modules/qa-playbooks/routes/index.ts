// src/modules/qa-playbooks/routes/index.ts
//
// All QA Playbooks endpoints under one mount point (/api/v2/qa/playbooks).
//
// MOUNT ORDER MATTERS: this router must be registered in app.ts BEFORE
// `app.use("/api/v2/qa", testCaseRoutes)`, because that router claims "/:id" and
// would otherwise swallow "/playbooks" as a test case id — the same hazard the
// comment above the test-scope mount already warns about.
//
// PERMISSIONS, in two layers:
//   qa.case.read    reading a playbook is reading testing guidance
//   qa.case.create  generating writes real test cases
//   qa.case.create  authoring a workspace playbook — writing guidance for your
//                   own team is the same authority as writing test cases
//   super_admin     publishing into the shared library, pricing, and granting
//                   access. Deliberately NOT a tenant-grantable permission.
//
// Route order inside this file matters too: the literal segments (/meta,
// /admin/...) are declared before "/:slug" and "/:id" so Express does not read
// them as identifiers.

import express from 'express';
import multer from 'multer';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requireAnyPermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { requireAiAccess } from '@/middleware/aiAccess';
import { requireSuperAdmin } from '../http';
import * as playbooks from '../controllers/playbook.controller';

const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

const canRead = requireAnyPermission(Permissions.QA_PLAYBOOK_READ, Permissions.QA_CASE_READ, Permissions.QA_MANAGE);
const canWrite = requireAnyPermission(Permissions.QA_PLAYBOOK_CREATE, Permissions.QA_PLAYBOOK_UPDATE, Permissions.QA_CASE_CREATE, Permissions.QA_MANAGE);
const canDelete = requireAnyPermission(Permissions.QA_PLAYBOOK_DELETE, Permissions.QA_CASE_DELETE, Permissions.QA_MANAGE);
const canTemplate = requireAnyPermission(Permissions.QA_PLAYBOOK_TEMPLATE, Permissions.QA_PLAYBOOK_READ, Permissions.QA_CASE_READ, Permissions.QA_MANAGE);
const canUpload = requireAnyPermission(Permissions.QA_PLAYBOOK_UPLOAD, Permissions.QA_PLAYBOOK_CREATE, Permissions.QA_CASE_CREATE, Permissions.QA_MANAGE);
const canRequest = requireAnyPermission(Permissions.QA_PLAYBOOK_REQUEST, Permissions.QA_PLAYBOOK_READ, Permissions.QA_CASE_READ, Permissions.QA_MANAGE);
const canRequested = requireAnyPermission(Permissions.QA_PLAYBOOK_REQUESTED, Permissions.QA_PLAYBOOK_READ, Permissions.QA_CASE_READ, Permissions.QA_MANAGE);
const canAccess = requireAnyPermission(Permissions.QA_PLAYBOOK_ACCESS, Permissions.QA_MANAGE);

/* ── Literal routes first ────────────────────────────────────────────────── */
router.get('/meta', canRead, playbooks.meta);

// Zai drafting a recommendation. Writing guidance is the same authority as
// authoring it by hand, plus the per-user AI toggle every AI route honours.
// Declared here, above '/:slug', so "ai" is never read as a playbook slug.
router.post('/ai/draft-recommendation', canWrite, requireAiAccess, playbooks.aiDraftRecommendation);

// A PRD read into draft playbooks. In memory, not on disk: the buffer is
// extracted, sent to the model and dropped — a requirements document is the
// customer's, and this module has no business keeping a copy of it.
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});
router.post(
  '/ai/from-document',
  canUpload,
  requireAiAccess,
  documentUpload.single('file'),
  playbooks.aiPlaybooksFromDocument
);

// One planned playbook, written. Called once per outline entry — see the two-pass
// note in services/zaiPlaybooksFromDocument.ts.
router.post(
  '/ai/from-document/expand',
  canUpload,
  requireAiAccess,
  playbooks.aiExpandPlaybookOutline
);

// Access administration — Testiez staff only.
router.get('/admin/unlock-requests', canAccess, requireSuperAdmin, playbooks.listRequests);
router.post('/admin/unlock-requests/:id', canAccess, requireSuperAdmin, playbooks.decideRequest);

// "Write us a playbook for this". Asking needs read access only — the QA who
// finds nothing for their feature is the one worth hearing from — while the
// queue of every workspace's asks is Testiez's to work through.
// Declared above '/:slug' so "requests" is never read as a playbook slug.
router.post('/requests', canRequest, playbooks.requestPlaybook);
router.get('/requests', canRequested, playbooks.listMyPlaybookRequests);
router.get(
  '/admin/playbook-requests',
  canRequested,
  requireSuperAdmin,
  playbooks.listAllPlaybookRequests
);
router.post(
  '/admin/playbook-requests/:id',
  canRequested,
  requireSuperAdmin,
  playbooks.decidePlaybookRequest
);

/* ── Catalog and authoring ───────────────────────────────────────────────── */
router.get('/', canRead, playbooks.list);
router.post('/', canWrite, playbooks.create);

// Category management across playbooks in workspace/platform scope
router.put('/categories/rename', canWrite, playbooks.renameCategory);
router.delete('/categories/:name', canDelete, playbooks.removeCategory);
router.post('/categories/:name/restore', canWrite, playbooks.restoreCategory);
router.delete('/categories/:name/permanent', canDelete, playbooks.permanentDeleteCategory);

// A batch pasted back from the downloadable template. Declared above '/:slug'
// so "import" is never read as a playbook slug.
router.post('/import', canUpload, playbooks.importPlaybooks);

// Trash listing (must be before /:slug)
router.get('/trash', canRead, playbooks.listTrash);

// "id/..." routes are declared before "/:slug" so a uuid path is never read as
// a slug. The trailing segment disambiguates them.
router.put('/:id/content', canWrite, playbooks.saveContent);
router.post('/:id/status', canWrite, playbooks.setStatus);
router.post('/:id/restore', canWrite, playbooks.restore);
router.delete('/:id/permanent', canDelete, playbooks.permanentDelete);
router.get('/:id/grants', canAccess, requireSuperAdmin, playbooks.listGrants);
router.post('/:id/grant', canAccess, requireSuperAdmin, playbooks.grant);
router.delete('/:id/grant/:tenantId', canAccess, requireSuperAdmin, playbooks.revoke);

/* ── Slug-addressed reads and actions ────────────────────────────────────── */
router.post('/:slug/generate', canWrite, playbooks.generate);
router.post('/:slug/unlock-request', canRead, playbooks.requestUnlock);
router.get('/:slug', canRead, playbooks.detail);

/* ── Bare id routes last ─────────────────────────────────────────────────── */
router.put('/:id', canWrite, playbooks.update);
router.delete('/:id', canDelete, playbooks.remove);

export default router;
