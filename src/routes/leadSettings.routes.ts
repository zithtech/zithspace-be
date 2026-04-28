import { Router } from 'express';
import { LeadSettingsController } from '@/controllers/LeadSettings.controller';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// Middleware
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// Status Routes
router.post('/statuses', LeadSettingsController.createStatus);
router.get('/statuses', LeadSettingsController.getStatuses);
router.put('/statuses/:id', LeadSettingsController.updateStatus);
router.delete('/statuses/:id', LeadSettingsController.deleteStatus);

// Action Routes
router.post('/actions', LeadSettingsController.createAction);
router.get('/actions', LeadSettingsController.getActions);
router.put('/actions/:id', LeadSettingsController.updateAction);
router.delete('/actions/:id', LeadSettingsController.deleteAction);

export default router;
