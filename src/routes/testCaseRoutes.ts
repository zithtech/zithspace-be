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
router.get('/modules', requireAnyPermission(Permissions.QA_CASE_READ, Permissions.QA_MANAGE), qaModuleController.getModules);
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
router.post('/', requireAnyPermission(Permissions.QA_CASE_CREATE, Permissions.QA_MANAGE), testCaseController.createTestCase);
router.get('/:id', requireAnyPermission(Permissions.QA_CASE_READ, Permissions.QA_MANAGE), testCaseController.getTestCase);
router.put('/:id', requireAnyPermission(Permissions.QA_CASE_UPDATE, Permissions.QA_MANAGE), testCaseController.updateTestCase);
router.delete('/:id', requireAnyPermission(Permissions.QA_CASE_DELETE, Permissions.QA_MANAGE), testCaseController.deleteTestCase);

// --- Test Suites ---
router.get('/suites/all', requireAnyPermission(Permissions.QA_SUITE_READ, Permissions.QA_MANAGE), testSuiteController.getTestSuites);
router.post('/suites', requireAnyPermission(Permissions.QA_SUITE_CREATE, Permissions.QA_MANAGE), testSuiteController.createTestSuite);
router.get('/suites/:id', requireAnyPermission(Permissions.QA_SUITE_READ, Permissions.QA_MANAGE), testSuiteController.getTestSuite);
router.put('/suites/:id', requireAnyPermission(Permissions.QA_SUITE_UPDATE, Permissions.QA_MANAGE), testSuiteController.updateTestSuite);
router.delete('/suites/:id', requireAnyPermission(Permissions.QA_SUITE_DELETE, Permissions.QA_MANAGE), testSuiteController.deleteTestSuite);

// --- Test Runs ---
router.get('/runs/all', requireAnyPermission(Permissions.QA_RUN_READ, Permissions.QA_MANAGE), testRunController.getTestRuns);
router.post('/runs', requireAnyPermission(Permissions.QA_RUN_CREATE, Permissions.QA_MANAGE), testRunController.createTestRun);
router.get('/runs/:id', requireAnyPermission(Permissions.QA_RUN_READ, Permissions.QA_MANAGE), testRunController.getTestRun);
router.put('/runs/:runId/results/:resultId', requireAnyPermission(Permissions.QA_RUN_UPDATE, Permissions.QA_MANAGE), testRunController.updateTestRunResult);
router.delete('/runs/:id', requireAnyPermission(Permissions.QA_RUN_DELETE, Permissions.QA_MANAGE), testRunController.deleteTestRun);

export default router;
