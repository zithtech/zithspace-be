import express from 'express';
import {
  getTestScopes,
  createTestScope,
  updateTestScope,
  deleteTestScope
} from '../controllers/testScopeController';
import { authenticateToken } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenantContext';

const router = express.Router();

// All routes require authentication
router.use(resolveTenant);
router.use(authenticateToken);

router.get('/', getTestScopes);
router.post('/', createTestScope);
router.put('/:id', updateTestScope);
router.delete('/:id', deleteTestScope);

export default router;
