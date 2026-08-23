import express from 'express';
import { LinearAuthController } from '../controllers/linearAuthController';
import { LinearIntegrationController } from '../controllers/linearIntegrationController';
import { authenticateToken, requireAuth } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenantContext';

const router = express.Router();

// GET /api/integrations/linear/connect
router.get(
  '/connect',
  resolveTenant,
  authenticateToken,
  requireAuth,
  LinearAuthController.getConnectUrl
);

// GET /api/integrations/linear/callback
// This callback doesn't use requireAuth because it's called by the OAuth provider (Linear)
router.get('/callback', LinearAuthController.handleCallback);

// GET /api/integrations/linear/status
router.get(
  '/status',
  resolveTenant,
  authenticateToken,
  requireAuth,
  LinearAuthController.getStatus
);

// POST /api/integrations/linear/disconnect
router.post(
  '/disconnect',
  resolveTenant,
  authenticateToken,
  requireAuth,
  LinearAuthController.disconnect
);

// Integration Endpoints (fetching and syncing)

// GET /api/integrations/linear/teams
router.get(
  '/teams',
  resolveTenant,
  authenticateToken,
  requireAuth,
  LinearIntegrationController.getTeams
);

// GET /api/integrations/linear/users
router.get(
  '/users',
  resolveTenant,
  authenticateToken,
  requireAuth,
  LinearIntegrationController.getUsers
);

// GET /api/integrations/linear/labels
router.get(
  '/labels',
  resolveTenant,
  authenticateToken,
  requireAuth,
  LinearIntegrationController.getLabels
);

// POST /api/integrations/linear/issue
router.post(
  '/issue',
  resolveTenant,
  authenticateToken,
  requireAuth,
  LinearIntegrationController.createIssue
);


// GET /api/integrations/linear/projects
router.get(
  '/projects',
  resolveTenant,
  authenticateToken,
  requireAuth,
  LinearIntegrationController.getProjects
);

// GET /api/integrations/linear/states
router.get(
  '/states',
  resolveTenant,
  authenticateToken,
  requireAuth,
  LinearIntegrationController.getStates
);

// GET /api/integrations/linear/cycles
router.get(
  '/cycles',
  resolveTenant,
  authenticateToken,
  requireAuth,
  LinearIntegrationController.getCycles
);

// POST /api/integrations/linear/migrations
router.post(
  '/migrations',
  resolveTenant,
  authenticateToken,
  requireAuth,
  LinearIntegrationController.startMigration
);

// GET /api/integrations/linear/migrations/:id
router.get(
  '/migrations/:id',
  resolveTenant,
  authenticateToken,
  requireAuth,
  LinearIntegrationController.getMigrationProgress
);


// POST /api/integrations/linear/tickets/preview
router.post(
  '/tickets/preview',
  resolveTenant,
  authenticateToken,
  requireAuth,
  LinearIntegrationController.getPreviewTickets
);

export default router;

