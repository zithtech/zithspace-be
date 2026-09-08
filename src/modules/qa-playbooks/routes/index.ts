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
import * as collections from '../controllers/collection.controller';

const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

const canRead = requireAnyPermission(Permissions.QA_CASE_READ, Permissions.QA_MANAGE);
const canWrite = requireAnyPermission(Permissions.QA_CASE_CREATE, Permissions.QA_MANAGE);

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
  canWrite,
  requireAiAccess,
  documentUpload.single('file'),
  playbooks.aiPlaybooksFromDocument
);

// One planned playbook, written. Called once per outline entry — see the two-pass
// note in services/zaiPlaybooksFromDocument.ts.
router.post(
  '/ai/from-document/expand',
  canWrite,
  requireAiAccess,
  playbooks.aiExpandPlaybookOutline
);

/* ── Collections ─────────────────────────────────────────────────────────
 * Curated, ordered bundles of playbooks ("Fintech & Payments"). The whole block
 * is declared above '/:slug' so "collections" is never read as a playbook slug —
 * the same hazard '/requests' and '/import' are placed here to avoid.
 *
 * ORDER INSIDE THIS BLOCK MATTERS TWICE OVER. '/collections/pins' and
 * '/collections/admin/...' are literal paths that would otherwise be swallowed
 * by '/collections/:id' and '/collections/:slug' — a PUT to .../pins would be
 * read as an edit of a collection whose id is the word "pins".
 *
 * AUTHORITY: reading is canRead, because the point of a pack is that a new
 * customer finds theirs on day one. Writing is canWrite, and the CONTROLLER
 * decides what a write means from who is asking — a super_admin curates the
 * platform library, everyone else curates their own workspace's packs. That is
 * the same split playbook authoring already uses, so there is no separate
 * super_admin guard on the curation routes; assertCanCurate enforces it against
 * the row that actually exists rather than against the request.
 */
router.put('/collections/pins', canRead, collections.setPins);
router.get(
  '/collections/admin/unlock-requests',
  canRead,
  requireSuperAdmin,
  collections.listUnlockRequests
);
router.post(
  '/collections/admin/unlock-requests/:id',
  canRead,
  requireSuperAdmin,
  collections.decideUnlockRequest
);

router.get('/collections', canRead, collections.list);
router.get('/collections/:slug', canRead, collections.detail);
router.post('/collections', canWrite, collections.create);
router.put('/collections/:id', canWrite, collections.update);
// Mapping existing playbooks into the pack, in order. Whole membership at once.
router.put('/collections/:id/playbooks', canWrite, collections.setPlaybooks);
// Filing one newly authored playbook into a pack, without touching its order.
router.post('/collections/:id/playbooks/:playbookId', canWrite, collections.addPlaybook);
router.post('/collections/:id/status', canWrite, collections.setStatus);
// Asking for a premium pack. canRead, for the reason the playbook equivalent is.
router.post('/collections/:slug/unlock-request', canRead, collections.requestUnlock);
router.delete('/collections/:id', canWrite, collections.remove);

// Access administration — Testiez staff only.
router.get('/admin/unlock-requests', canRead, requireSuperAdmin, playbooks.listRequests);
router.post('/admin/unlock-requests/:id', canRead, requireSuperAdmin, playbooks.decideRequest);

// "Write us a playbook for this". Asking needs read access only — the QA who
// finds nothing for their feature is the one worth hearing from — while the
// queue of every workspace's asks is Testiez's to work through.
// Declared above '/:slug' so "requests" is never read as a playbook slug.
router.post('/requests', canRead, playbooks.requestPlaybook);
router.get('/requests', canRead, playbooks.listMyPlaybookRequests);
router.get(
  '/admin/playbook-requests',
  canRead,
  requireSuperAdmin,
  playbooks.listAllPlaybookRequests
);
router.post(
  '/admin/playbook-requests/:id',
  canRead,
  requireSuperAdmin,
  playbooks.decidePlaybookRequest
);

/* ── Catalog and authoring ───────────────────────────────────────────────── */
router.get('/', canRead, playbooks.list);
router.post('/', canWrite, playbooks.create);

// A batch pasted back from the downloadable template. Declared above '/:slug'
// so "import" is never read as a playbook slug.
router.post('/import', canWrite, playbooks.importPlaybooks);

// "id/..." routes are declared before "/:slug" so a uuid path is never read as
// a slug. The trailing segment disambiguates them.
router.put('/:id/content', canWrite, playbooks.saveContent);
router.post('/:id/status', canWrite, playbooks.setStatus);
router.get('/:id/grants', canRead, requireSuperAdmin, playbooks.listGrants);
router.post('/:id/grant', canRead, requireSuperAdmin, playbooks.grant);
router.delete('/:id/grant/:tenantId', canRead, requireSuperAdmin, playbooks.revoke);

/* ── Slug-addressed reads and actions ────────────────────────────────────── */
router.post('/:slug/generate', canWrite, playbooks.generate);
router.post('/:slug/unlock-request', canRead, playbooks.requestUnlock);
router.get('/:slug', canRead, playbooks.detail);

/* ── Bare id routes last ─────────────────────────────────────────────────── */
router.put('/:id', canWrite, playbooks.update);
router.delete('/:id', canWrite, playbooks.remove);

export default router;
