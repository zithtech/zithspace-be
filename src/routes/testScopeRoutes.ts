import express from 'express';
import {
  getTestScopes,
  getTestScope,
  createTestScope,
  updateTestScope,
  deleteTestScope,
  generateScopeContentAI,
  enhanceScopeText,
  aiRewriteScopeSelection,
  exportPdf,
  getHubDocuments,
  getTestScopesStats
} from '../controllers/testScopeController';
import {
  getScopeSettings,
  createScopeSetting,
  updateScopeSetting,
  deleteScopeSetting
} from '../controllers/testScopeSettingsController';
import { authenticateToken } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenantContext';
import { requireAnyPermission } from '../middleware/permission';
import { Permissions } from '../types/permissions';

const router = express.Router();

// All routes require authentication
router.use(resolveTenant);
router.use(authenticateToken);

router.get('/', requireAnyPermission(Permissions.QA_SCOPE_READ, Permissions.QA_MANAGE), getTestScopes);
router.get('/stats', requireAnyPermission(Permissions.QA_SCOPE_READ, Permissions.QA_MANAGE), getTestScopesStats);
router.post('/', requireAnyPermission(Permissions.QA_SCOPE_CREATE, Permissions.QA_MANAGE), createTestScope);
router.post('/generate-ai', requireAnyPermission(Permissions.QA_SCOPE_CREATE, Permissions.QA_MANAGE), generateScopeContentAI);
router.get('/documents', requireAnyPermission(Permissions.QA_SCOPE_READ, Permissions.QA_MANAGE), getHubDocuments);
router.post('/enhance-text', requireAnyPermission(Permissions.QA_SCOPE_CREATE, Permissions.QA_MANAGE), enhanceScopeText);
router.post('/ai-rewrite', requireAnyPermission(Permissions.QA_SCOPE_CREATE, Permissions.QA_SCOPE_UPDATE, Permissions.QA_MANAGE), aiRewriteScopeSelection);

// Scope Settings (Type, Priority, Status)
router.get('/settings', requireAnyPermission(Permissions.QA_SCOPE_READ, Permissions.QA_MANAGE), getScopeSettings);
router.post('/settings', requireAnyPermission(Permissions.QA_SCOPE_CREATE, Permissions.QA_MANAGE), createScopeSetting);
router.put('/settings/:id', requireAnyPermission(Permissions.QA_SCOPE_UPDATE, Permissions.QA_MANAGE), updateScopeSetting);
router.delete('/settings/:id', requireAnyPermission(Permissions.QA_SCOPE_DELETE, Permissions.QA_MANAGE), deleteScopeSetting);

// Dynamic ID routes must be at the bottom
router.get('/:id', requireAnyPermission(Permissions.QA_SCOPE_READ, Permissions.QA_MANAGE), getTestScope);
router.put('/:id', requireAnyPermission(Permissions.QA_SCOPE_UPDATE, Permissions.QA_MANAGE), updateTestScope);
router.delete('/:id', requireAnyPermission(Permissions.QA_SCOPE_DELETE, Permissions.QA_MANAGE), deleteTestScope);
router.post('/:id/export-pdf', requireAnyPermission(Permissions.QA_SCOPE_READ, Permissions.QA_MANAGE), exportPdf);

export default router;
