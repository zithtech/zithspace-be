import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenantContext';
import { requireAnyPermission } from '../middleware/permission';
import { Permissions } from '../types/permissions';
import { requireSubscriptionFeature } from '@/modules/entitlements/entitlements.middleware';
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
  Permissions.QA_COVERAGE_MAP_READ,
), requireSubscriptionFeature('work_qa_space_cases', { exact: false }), qaModuleController.getModules);
router.post('/modules', requireAnyPermission(Permissions.QA_CASE_CREATE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_cases', { exact: false }), qaModuleController.createModule);
router.put('/modules/:id', requireAnyPermission(Permissions.QA_CASE_UPDATE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_cases', { exact: false }), qaModuleController.updateModule);
router.delete('/modules/:id', requireAnyPermission(Permissions.QA_CASE_DELETE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_cases', { exact: false }), qaModuleController.deleteModule);

// --- Parent Test Cases (Business Scenarios) ---
router.get('/parents', requireAnyPermission(Permissions.QA_CASE_READ, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_cases', { exact: false }), parentTestCaseController.getParentTestCases);
router.post('/parents', requireAnyPermission(Permissions.QA_CASE_CREATE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_cases', { exact: false }), parentTestCaseController.createParentTestCase);
router.get('/parents/:id', requireAnyPermission(Permissions.QA_CASE_READ, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_cases', { exact: false }), parentTestCaseController.getParentTestCase);
router.put('/parents/:id', requireAnyPermission(Permissions.QA_CASE_UPDATE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_cases', { exact: false }), parentTestCaseController.updateParentTestCase);
router.delete('/parents/:id', requireAnyPermission(Permissions.QA_CASE_DELETE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_cases', { exact: false }), parentTestCaseController.deleteParentTestCase);

// --- Test Cases (Child) ---
router.get('/', requireAnyPermission(Permissions.QA_CASE_READ, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_cases', { exact: false }), testCaseController.getTestCases);
// Must stay above '/:id' — otherwise Express reads it as a test case id.
router.get('/testing-types', requireAnyPermission(Permissions.QA_CASE_READ, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_cases', { exact: false }), testCaseController.getTestCaseTypeFacets);
router.post('/generate-ai', requireAnyPermission(Permissions.QA_CASE_CREATE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_cases', { exact: false }), testCaseController.generateTestCaseAI);
router.post('/correct-spelling', requireAnyPermission(Permissions.QA_CASE_CREATE, Permissions.QA_CASE_UPDATE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_cases', { exact: false }), testCaseController.correctTestCaseSpelling);
router.post('/', requireAnyPermission(Permissions.QA_CASE_CREATE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_cases', { exact: false }), testCaseController.createTestCase);
router.get('/:id', requireAnyPermission(Permissions.QA_CASE_READ, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_cases', { exact: false }), testCaseController.getTestCase);
router.put('/:id', requireAnyPermission(Permissions.QA_CASE_UPDATE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_cases', { exact: false }), testCaseController.updateTestCase);
router.delete('/:id', requireAnyPermission(Permissions.QA_CASE_DELETE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_cases', { exact: false }), testCaseController.deleteTestCase);

// --- Test Suites ---
router.get('/suites/all', requireAnyPermission(Permissions.QA_SUITE_READ, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_suites', { exact: false }), testSuiteController.getTestSuites);
router.post('/suites/ai-text', requireAnyPermission(Permissions.QA_SUITE_CREATE, Permissions.QA_SUITE_UPDATE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_suites', { exact: false }), testSuiteController.suiteAiText);
router.post('/suites', requireAnyPermission(Permissions.QA_SUITE_CREATE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_suites', { exact: false }), testSuiteController.createTestSuite);
router.get('/suites/:id', requireAnyPermission(Permissions.QA_SUITE_READ, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_suites', { exact: false }), testSuiteController.getTestSuite);
router.get('/suites/:id/cases', requireAnyPermission(Permissions.QA_SUITE_READ, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_suites', { exact: false }), testSuiteController.getTestSuiteCases);
router.put('/suites/:id', requireAnyPermission(Permissions.QA_SUITE_UPDATE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_suites', { exact: false }), testSuiteController.updateTestSuite);
router.delete('/suites/:id', requireAnyPermission(Permissions.QA_SUITE_DELETE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_suites', { exact: false }), testSuiteController.deleteTestSuite);

// --- Test Runs ---
router.get('/runs/all', requireAnyPermission(Permissions.QA_RUN_READ, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_runs', { exact: false }), testRunController.getTestRuns);
router.post('/runs', requireAnyPermission(Permissions.QA_RUN_CREATE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_runs', { exact: false }), testRunController.createTestRun);
router.get('/runs/:id', requireAnyPermission(Permissions.QA_RUN_READ, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_runs', { exact: false }), testRunController.getTestRun);
router.post('/runs/note-grammar', requireAnyPermission(Permissions.QA_RUN_UPDATE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_runs', { exact: false }), testRunController.runNoteGrammar);
router.post('/runs/:runId/cases', requireAnyPermission(Permissions.QA_CASE_CREATE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_runs', { exact: false }), testRunController.addCaseToRun);
router.post('/runs/:runId/results/:resultId/attachments', requireAnyPermission(Permissions.QA_RUN_UPDATE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_runs', { exact: false }), testRunController.addResultAttachment);
router.delete('/runs/:runId/results/:resultId/attachments/:attachmentId', requireAnyPermission(Permissions.QA_RUN_UPDATE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_runs', { exact: false }), testRunController.deleteResultAttachment);
router.post('/runs/:runId/results/:resultId/bug-link', requireAnyPermission(Permissions.QA_RUN_UPDATE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_runs', { exact: false }), testRunController.linkResultBug);
router.put('/runs/:runId/results/:resultId', requireAnyPermission(Permissions.QA_RUN_UPDATE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_runs', { exact: false }), testRunController.updateTestRunResult);
router.delete('/runs/:id', requireAnyPermission(Permissions.QA_RUN_DELETE, Permissions.QA_MANAGE), requireSubscriptionFeature('work_qa_space_runs', { exact: false }), testRunController.deleteTestRun);

export default router;
