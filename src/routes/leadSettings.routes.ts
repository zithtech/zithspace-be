import { Router } from 'express';
import { LeadSettingsController } from '@/controllers/LeadSettings.controller';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// Middleware
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// Status Routes
router.post('/statuses', requirePermission(Permissions.LEAD_SETTING_CREATE), LeadSettingsController.createStatus);
router.get('/statuses', requirePermission(Permissions.LEAD_SETTING_READ), LeadSettingsController.getStatuses);
router.put('/statuses/:id', requirePermission(Permissions.LEAD_SETTING_UPDATE), LeadSettingsController.updateStatus);
router.delete('/statuses/:id', requirePermission(Permissions.LEAD_SETTING_DELETE), LeadSettingsController.deleteStatus);

// Action Routes
router.post('/actions', requirePermission(Permissions.LEAD_SETTING_CREATE), LeadSettingsController.createAction);
router.get('/actions', requirePermission(Permissions.LEAD_SETTING_READ), LeadSettingsController.getActions);
router.put('/actions/:id', requirePermission(Permissions.LEAD_SETTING_UPDATE), LeadSettingsController.updateAction);
router.delete('/actions/:id', requirePermission(Permissions.LEAD_SETTING_DELETE), LeadSettingsController.deleteAction);

export default router;
