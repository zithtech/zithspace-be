import express from 'express';
import {
  getDevelopmentInfo,
  updateDevelopmentInfo,
  getPullRequests,
  createPullRequest,
  updatePullRequest,
  deletePullRequest,
} from '../controllers/ticketDevelopmentController.js';
import { authenticateToken } from '../middleware/auth.js';
import { resolveTenant } from '../middleware/tenantContext.js';

const router = express.Router();

// Apply authentication and tenant context to all routes
router.use(authenticateToken);
router.use(resolveTenant);

// Development Info Routes
router.get('/:ticketId/development-info', getDevelopmentInfo);
router.put('/:ticketId/development-info', updateDevelopmentInfo);

// Pull Request Routes
router.get('/:ticketId/pull-requests', getPullRequests);
router.post('/:ticketId/pull-requests', createPullRequest);
router.put('/:ticketId/pull-requests/:prId', updatePullRequest);
router.delete('/:ticketId/pull-requests/:prId', deletePullRequest);

export default router;
