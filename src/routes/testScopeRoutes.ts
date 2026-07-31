import express from 'express';
import {
  getTestScopes,
  createTestScope,
  updateTestScope,
  deleteTestScope,
  generateScopeContentAI
} from '../controllers/testScopeController';
import {
  getScopeSettings,
  createScopeSetting,
  updateScopeSetting,
  deleteScopeSetting
} from '../controllers/testScopeSettingsController';
import { authenticateToken } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenantContext';

const router = express.Router();

// All routes require authentication
router.use(resolveTenant);
router.use(authenticateToken);

router.get('/', getTestScopes);
router.post('/', createTestScope);
router.post('/generate-ai', generateScopeContentAI);

// Scope Settings (Type, Priority, Status)
router.get('/settings', getScopeSettings);
router.post('/settings', createScopeSetting);
router.put('/settings/:id', updateScopeSetting);
router.delete('/settings/:id', deleteScopeSetting);

router.put('/:id', updateTestScope);
router.delete('/:id', deleteTestScope);

export default router;
