import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { MailConfigurationController } from '../controllers/MailConfigurationController';
import { 
  validateMailConfiguration, 
  validateMailConfigurationUpdate, 
  validateAtLeastOneField, 
  validateMailConfigurationId,
  validateMailConfigurationQuery 
} from '../middleware/mailConfigurationValidation';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/mail-configuration
 * Get mail configuration for the current tenant
 */
router.get('/', MailConfigurationController.getMailConfiguration);

/**
 * POST /api/mail-configuration
 * Create or update mail configuration for the current tenant
 */
router.post('/', validateMailConfiguration, MailConfigurationController.upsertMailConfiguration);

/**
 * PUT /api/mail-configuration/:id
 * Update specific mail configuration by ID
 */
router.put('/:id', 
  validateMailConfigurationId, 
  validateAtLeastOneField,
  validateMailConfigurationUpdate, 
  MailConfigurationController.updateMailConfiguration
);

/**
 * DELETE /api/mail-configuration/:id
 * Delete specific mail configuration by ID
 */
router.delete('/:id', validateMailConfigurationId, MailConfigurationController.deleteMailConfiguration);

/**
 * DELETE /api/mail-configuration
 * Delete mail configuration for the current tenant
 */
router.delete('/', MailConfigurationController.deleteMailConfiguration);

/**
 * POST /api/mail-configuration/test
 * Test mail configuration by sending a test email
 */
router.post('/test', MailConfigurationController.testMailConfiguration);

/**
 * GET /api/mail-configuration/status
 * Get mail status (configured, active, etc.)
 */
router.get('/status', MailConfigurationController.getMailStatus);

/**
 * GET /api/mail-configuration/all
 * Get all mail configurations (admin only)
 */
router.get('/all', validateMailConfigurationQuery, MailConfigurationController.getAllMailConfigurations);

export default router;
