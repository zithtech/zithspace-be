import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenantContext';
import { requireAnyPermission } from '../middleware/permission';
import { Permissions } from '../types/permissions';
import * as qaModuleController from '../controllers/qaModuleController';
import * as parentTestCaseController from '../controllers/parentTestCaseController';
import * as testCaseController from '../controllers/testCaseController';
import * as testSuiteController from '../controllers/testSuiteController';
import * as testRunController from '../controllers/testRunController';

const router = express.Router();

// Apply auth middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);

// --- Todo Modules ---
// The module list is the taxonomy the whole workspace files against — bugs and
// scopes read it too, so reading it is not gated on the test-case grants alone.
router.get('/modules', requireAnyPermission(
  Permissions.QA_CASE_READ, Permissions.QA_MANAGE,
  Permissions.QA_SCOPE_READ, Permissions.BUG_READ, Permissions.BUG_CREATE,
), qaModuleController.getModules);
router.post('/modules', requireAnyPermission(Permissions.QA_CASE_CREATE, Permissions.QA_MANAGE), qaModuleController.createModule);
router.put('/modules/:id', requireAnyPermission(Permissions.QA_CASE_UPDATE, Permissions.QA_MANAGE), qaModuleController.updateModule);
router.delete('/modules/:id', requireAnyPermission(Permissions.QA_CASE_DELETE, Permissions.QA_MANAGE), qaModuleController.deleteModule);

// --- Parent Test Cases (Business Scenarios) ---
router.get('/parents', requireAnyPermission(Permissions.QA_CASE_READ, Permissions.QA_MANAGE), parentTestCaseController.getParentTestCases);
router.post('/parents', requireAnyPermission(Permissions.QA_CASE_CREATE, Permissions.QA_MANAGE), parentTestCaseController.createParentTestCase);
router.get('/parents/:id', requireAnyPermission(Permissions.QA_CASE_READ, Permissions.QA_MANAGE), parentTestCaseController.getParentTestCase);
router.put('/parents/:id', requireAnyPermission(Permissions.QA_CASE_UPDATE, Permissions.QA_MANAGE), parentTestCaseController.updateParentTestCase);
router.delete('/parents/:id', requireAnyPermission(Permissions.QA_CASE_DELETE, Permissions.QA_MANAGE), parentTestCaseController.deleteParentTestCase);

// --- Test Cases (Child) ---
router.get('/', requireAnyPermission(Permissions.QA_CASE_READ, Permissions.QA_MANAGE), testCaseController.getTestCases);
// Must stay above '/:id' — otherwise Express reads it as a test case id.
router.get('/testing-types', requireAnyPermission(Permissions.QA_CASE_READ, Permissions.QA_MANAGE), testCaseController.getTestCaseTypeFacets);
router.post('/generate-ai', requireAnyPermission(Permissions.QA_CASE_CREATE, Permissions.QA_MANAGE), testCaseController.generateTestCaseAI);
router.post('/', requireAnyPermission(Permissions.QA_CASE_CREATE, Permissions.QA_MANAGE), testCaseController.createTestCase);
router.get('/:id', requireAnyPermission(Permissions.QA_CASE_READ, Permissions.QA_MANAGE), testCaseController.getTestCase);
router.put('/:id', requireAnyPermission(Permissions.QA_CASE_UPDATE, Permissions.QA_MANAGE), testCaseController.updateTestCase);
router.delete('/:id', requireAnyPermission(Permissions.QA_CASE_DELETE, Permissions.QA_MANAGE), testCaseController.deleteTestCase);

// --- Test Suites ---
router.get('/suites/all', requireAnyPermission(Permissions.QA_SUITE_READ, Permissions.QA_MANAGE), testSuiteController.getTestSuites);
router.post('/suites/ai-text', requireAnyPermission(Permissions.QA_SUITE_CREATE, Permissions.QA_SUITE_UPDATE, Permissions.QA_MANAGE), testSuiteController.suiteAiText);
router.post('/suites', requireAnyPermission(Permissions.QA_SUITE_CREATE, Permissions.QA_MANAGE), testSuiteController.createTestSuite);
router.get('/suites/:id', requireAnyPermission(Permissions.QA_SUITE_READ, Permissions.QA_MANAGE), testSuiteController.getTestSuite);
router.get('/suites/:id/cases', requireAnyPermission(Permissions.QA_SUITE_READ, Permissions.QA_MANAGE), testSuiteController.getTestSuiteCases);
router.put('/suites/:id', requireAnyPermission(Permissions.QA_SUITE_UPDATE, Permissions.QA_MANAGE), testSuiteController.updateTestSuite);
router.delete('/suites/:id', requireAnyPermission(Permissions.QA_SUITE_DELETE, Permissions.QA_MANAGE), testSuiteController.deleteTestSuite);

// --- Test Runs ---
router.get('/runs/all', requireAnyPermission(Permissions.QA_RUN_READ, Permissions.QA_MANAGE), testRunController.getTestRuns);
router.post('/runs', requireAnyPermission(Permissions.QA_RUN_CREATE, Permissions.QA_MANAGE), testRunController.createTestRun);
router.get('/runs/:id', requireAnyPermission(Permissions.QA_RUN_READ, Permissions.QA_MANAGE), testRunController.getTestRun);
router.post('/runs/note-grammar', requireAnyPermission(Permissions.QA_RUN_UPDATE, Permissions.QA_MANAGE), testRunController.runNoteGrammar);
router.post('/runs/:runId/cases', requireAnyPermission(Permissions.QA_CASE_CREATE, Permissions.QA_MANAGE), testRunController.addCaseToRun);
router.post('/runs/:runId/results/:resultId/attachments', requireAnyPermission(Permissions.QA_RUN_UPDATE, Permissions.QA_MANAGE), testRunController.addResultAttachment);
router.delete('/runs/:runId/results/:resultId/attachments/:attachmentId', requireAnyPermission(Permissions.QA_RUN_UPDATE, Permissions.QA_MANAGE), testRunController.deleteResultAttachment);
router.post('/runs/:runId/results/:resultId/bug-link', requireAnyPermission(Permissions.QA_RUN_UPDATE, Permissions.QA_MANAGE), testRunController.linkResultBug);
router.put('/runs/:runId/results/:resultId', requireAnyPermission(Permissions.QA_RUN_UPDATE, Permissions.QA_MANAGE), testRunController.updateTestRunResult);
router.delete('/runs/:id', requireAnyPermission(Permissions.QA_RUN_DELETE, Permissions.QA_MANAGE), testRunController.deleteTestRun);

export default router;
