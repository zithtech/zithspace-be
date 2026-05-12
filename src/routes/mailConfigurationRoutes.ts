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

import { requirePermission } from '../middleware/permission';
import { Permissions } from '../types/permissions';

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/mail-configuration
 * Get mail configuration for the current tenant
 */
router.get('/', requirePermission(Permissions.MAIL_READ), MailConfigurationController.getMailConfiguration);

/**
 * POST /api/mail-configuration
 * Create or update mail configuration for the current tenant
 */
router.post('/', requirePermission(Permissions.MAIL_UPDATE), validateMailConfiguration, MailConfigurationController.upsertMailConfiguration);

/**
 * PUT /api/mail-configuration/:id
 * Update specific mail configuration by ID
 */
router.put('/:id', 
  requirePermission(Permissions.MAIL_UPDATE),
  validateMailConfigurationId, 
  validateAtLeastOneField,
  validateMailConfigurationUpdate, 
  MailConfigurationController.updateMailConfiguration
);

/**
 * DELETE /api/mail-configuration/:id
 * Delete specific mail configuration by ID
 */
router.delete('/:id', requirePermission(Permissions.MAIL_DELETE), validateMailConfigurationId, MailConfigurationController.deleteMailConfiguration);

/**
 * DELETE /api/mail-configuration
 * Delete mail configuration for the current tenant
 */
router.delete('/', requirePermission(Permissions.MAIL_DELETE), MailConfigurationController.deleteMailConfiguration);

/**
 * POST /api/mail-configuration/test
 * Test mail configuration by sending a test email
 */
router.post('/test', requirePermission(Permissions.MAIL_UPDATE), MailConfigurationController.testMailConfiguration);

/**
 * GET /api/mail-configuration/status
 * Get mail status (configured, active, etc.)
 */
router.get('/status', requirePermission(Permissions.MAIL_READ), MailConfigurationController.getMailStatus);

/**
 * GET /api/mail-configuration/all
 * Get all mail configurations (admin only)
 */
router.get('/all', requirePermission(Permissions.MAIL_READ), validateMailConfigurationQuery, MailConfigurationController.getAllMailConfigurations);

export default router;
