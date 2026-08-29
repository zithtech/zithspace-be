// src/modules/yapiez/routes/index.ts
//
// All Yapiez endpoints under one mount point (/api/v2/yapiez). Tenant + auth
// middleware is applied once for the whole module, matching the platform
// convention (resolveTenant → authenticateToken → requireAuth).
//
// Two authorities are separated on purpose:
//   YAPIEZ_API_*   the developer's catalog — defining what an endpoint is
//   YAPIEZ_FLOW_*  QA's composition — deciding what gets executed together
// and YAPIEZ_FLOW_EXECUTE is separate again, because running a flow sends real
// requests to a real environment. Being able to read a flow is not permission
// to fire it at production.

import express from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requireAnyPermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { validateUuidParam } from '../http';
import { requireAiAccess } from '@/middleware/aiAccess';
import * as catalog from '../controllers/catalog.controller';
import * as environments from '../controllers/environment.controller';
import * as flows from '../controllers/flow.controller';
import * as runs from '../controllers/run.controller';
import * as payloads from '../controllers/payload.controller';

const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.param('id', validateUuidParam);
router.param('stepId', validateUuidParam);
router.param('scopeId', validateUuidParam);

const canReadApi = requireAnyPermission(Permissions.YAPIEZ_API_READ, Permissions.YAPIEZ_MANAGE);
const canCreateApi = requireAnyPermission(Permissions.YAPIEZ_API_CREATE, Permissions.YAPIEZ_MANAGE);
const canUpdateApi = requireAnyPermission(Permissions.YAPIEZ_API_UPDATE, Permissions.YAPIEZ_MANAGE);
const canDeleteApi = requireAnyPermission(Permissions.YAPIEZ_API_DELETE, Permissions.YAPIEZ_MANAGE);
// Sending a live request from the editor — same outbound risk as running a
// flow, so FLOW_EXECUTE grants it too rather than forcing a second assignment.
const canTryApi = requireAnyPermission(
  Permissions.YAPIEZ_API_TRY,
  Permissions.YAPIEZ_FLOW_EXECUTE,
  Permissions.YAPIEZ_MANAGE
);

// Case payloads sit across two authorities on purpose. Reading one is reading
// the test case it belongs to, so a tester with QA_CASE_READ and no catalog
// grant still sees the bodies they are meant to run. Writing one is authoring
// test-case content, not editing the API definition it was drafted from — an
// API author's grants do not extend to it, and a case author's do.
const canReadPayload = requireAnyPermission(
  Permissions.QA_CASE_READ,
  Permissions.QA_MANAGE,
  Permissions.YAPIEZ_API_READ,
  Permissions.YAPIEZ_MANAGE
);
const canWritePayload = requireAnyPermission(
  Permissions.QA_CASE_CREATE,
  Permissions.QA_CASE_UPDATE,
  Permissions.QA_MANAGE,
  Permissions.YAPIEZ_MANAGE
);
const canDeletePayload = requireAnyPermission(
  Permissions.QA_CASE_DELETE,
  Permissions.QA_CASE_UPDATE,
  Permissions.QA_MANAGE,
  Permissions.YAPIEZ_MANAGE
);

const canReadFlow = requireAnyPermission(Permissions.YAPIEZ_FLOW_READ, Permissions.YAPIEZ_MANAGE);
const canCreateFlow = requireAnyPermission(Permissions.YAPIEZ_FLOW_CREATE, Permissions.YAPIEZ_MANAGE);
const canUpdateFlow = requireAnyPermission(Permissions.YAPIEZ_FLOW_UPDATE, Permissions.YAPIEZ_MANAGE);
const canDeleteFlow = requireAnyPermission(Permissions.YAPIEZ_FLOW_DELETE, Permissions.YAPIEZ_MANAGE);
const canExecute = requireAnyPermission(Permissions.YAPIEZ_FLOW_EXECUTE, Permissions.YAPIEZ_MANAGE);

const canReadRun = requireAnyPermission(Permissions.YAPIEZ_RUN_READ, Permissions.YAPIEZ_MANAGE);
const canDeleteRun = requireAnyPermission(Permissions.YAPIEZ_RUN_DELETE, Permissions.YAPIEZ_MANAGE);

const canReadEnv = requireAnyPermission(Permissions.YAPIEZ_ENV_READ, Permissions.YAPIEZ_MANAGE);
const canWriteEnv = requireAnyPermission(Permissions.YAPIEZ_ENV_MANAGE, Permissions.YAPIEZ_MANAGE);

// Raising a bug from a failed step writes into the Bug List, so it is gated on
// the Bug List's own create permission rather than on a Yapiez one.
const canRaiseBug = requireAnyPermission(Permissions.BUG_CREATE, Permissions.BUG_MANAGE, Permissions.YAPIEZ_MANAGE);

// ─── AI ─────────────────────────────────────────────────────────────────────
// Writing a definition is the authority here; requireAiAccess then honours the
// per-user AI toggle on top of it.
router.post(
  '/ai/grammar',
  requireAnyPermission(Permissions.YAPIEZ_API_CREATE, Permissions.YAPIEZ_API_UPDATE, Permissions.YAPIEZ_MANAGE),
  requireAiAccess,
  catalog.fixGrammar
);

// ─── Overview ───────────────────────────────────────────────────────────────
router.get('/stats', canReadApi, catalog.stats);

// ─── Sources (deployment tier above collections) ────────────────────────────
// Read is gated on reading the catalog; writing a tier is catalog structure,
// so it follows the API create/update/delete authorities.
router.get('/sources', canReadApi, catalog.listSources);
router.post('/sources', canCreateApi, catalog.createSource);
router.put('/sources/:id', canUpdateApi, catalog.updateSource);
router.delete('/sources/:id', canDeleteApi, catalog.deleteSource);

// ─── Collections ────────────────────────────────────────────────────────────
router.get('/collections', canReadApi, catalog.listCollections);
router.post('/collections', canCreateApi, catalog.createCollection);
router.put('/collections/:id', canUpdateApi, catalog.updateCollection);
router.delete('/collections/:id', canDeleteApi, catalog.deleteCollection);

// ─── Modules ────────────────────────────────────────────────────────────────
// The curated module list belongs to QA Settings, and so does renaming — a
// rename there cascades into the catalog. This only unfiles a name the catalog
// still holds, which is the one case settings knows nothing about.
router.delete('/modules', canUpdateApi, catalog.unfileModule);

// ─── Trash ──────────────────────────────────────────────────────────────────
// Restoring is a write, not a delete: it puts a definition back into the
// catalog, so it follows the update authority. Purging is the only thing here
// that is actually irreversible, and it follows delete.
router.get('/trash', canReadApi, catalog.listTrash);
router.post('/trash/restore', canUpdateApi, catalog.restoreFromTrash);
router.delete('/trash/item', canDeleteApi, catalog.purgeFromTrash);
router.delete('/trash', canDeleteApi, catalog.emptyTrash);

// ─── Environments ───────────────────────────────────────────────────────────
router.get('/environments', canReadEnv, environments.list);
router.post('/environments', canWriteEnv, environments.create);
router.get('/environments/:id', canReadEnv, environments.get);
router.put('/environments/:id', canWriteEnv, environments.update);
router.delete('/environments/:id', canWriteEnv, environments.remove);

// ─── Runs (static paths before /flows/:id so neither shadows the other) ─────
router.get('/runs', canReadRun, runs.list);
router.get('/runs/bug-targets', canReadRun, runs.listBugTargets);
router.get('/runs/:id', canReadRun, runs.get);
router.delete('/runs/:id', canDeleteRun, runs.remove);
router.get('/run-steps/:stepId/bug-draft', canReadRun, runs.bugDraft);
router.post('/run-steps/:stepId/bug', canRaiseBug, runs.raiseBug);
router.post('/run-steps/:stepId/link-bug', canRaiseBug, runs.linkExistingBug);

// ─── QA Space integration ───────────────────────────────────────────────────
// Scope-level roll-up, read with the QA Space scope permission so the Test
// Scope page can show it without granting Yapiez access separately.
router.get(
  '/scopes/:scopeId/summary',
  requireAnyPermission(
    Permissions.YAPIEZ_RUN_READ,
    Permissions.QA_SCOPE_READ,
    Permissions.QA_SUBMISSION_READ,
    Permissions.YAPIEZ_MANAGE,
    Permissions.QA_MANAGE
  ),
  runs.scopeSummary
);

// ─── Flows ──────────────────────────────────────────────────────────────────
router.get('/flows', canReadFlow, flows.list);
router.post('/flows', canCreateFlow, flows.create);
router.get('/flows/:id', canReadFlow, flows.get);
router.put('/flows/:id', canUpdateFlow, flows.update);
router.delete('/flows/:id', canDeleteFlow, flows.remove);
router.post('/flows/:id/duplicate', canCreateFlow, flows.duplicate);
router.post('/flows/:id/run', canExecute, runs.execute);

router.get('/flows/:id/steps', canReadFlow, flows.listSteps);
router.post('/flows/:id/steps', canUpdateFlow, flows.addStep);
router.put('/flows/:id/steps/reorder', canUpdateFlow, flows.reorderSteps);
router.get('/flows/:id/steps/:stepId/preview', canReadFlow, flows.previewStep);
router.put('/flows/:id/steps/:stepId', canUpdateFlow, flows.updateStep);
router.delete('/flows/:id/steps/:stepId', canUpdateFlow, flows.removeStep);

// ─── Case payloads (Positive / Negative / Valid / Invalid) ──────────────────
//
// Static paths before "/payloads/:id", or Express reads "generate" as an id.
// Generating writes nothing, so it is gated on writing a case rather than on
// AI-specific grants; requireAiAccess then honours the per-user toggle, and the
// builder still answers from the API's structure when AI is unavailable.
router.post('/payloads/generate', canWritePayload, requireAiAccess, payloads.generatePayload);
router.post('/payloads/link', canWritePayload, payloads.linkPayloads);
router.get('/payloads/for-cases', canReadPayload, payloads.payloadsForCases);
router.get('/payloads', canReadPayload, payloads.listPayloads);
router.post('/payloads', canWritePayload, payloads.createPayload);
router.put('/payloads/:id', canWritePayload, payloads.updatePayload);
router.delete('/payloads/:id', canDeletePayload, payloads.deletePayload);

// ─── API definitions (dynamic :id last within its own namespace) ────────────
// Static path first, or "/apis/:id" would claim "try" as an id.
router.post('/apis/try', canTryApi, catalog.tryApi);
router.get('/apis', canReadApi, catalog.listApis);
// Also static, and also before "/apis/:id" for the same reason.
router.get('/apis/module-summary', canReadApi, catalog.moduleSummaries);
router.post('/apis', canCreateApi, catalog.createApi);
router.get('/apis/:id', canReadApi, catalog.getApi);
// Reading past responses is a read of run history, not an outbound request.
router.get('/apis/:id/captured-responses', canReadRun, catalog.capturedResponses);
router.put('/apis/:id', canUpdateApi, catalog.updateApi);
router.delete('/apis/:id', canDeleteApi, catalog.deleteApi);

export default router;
