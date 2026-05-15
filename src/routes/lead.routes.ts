import { Router } from 'express';
import { LeadController } from '@/controllers/Lead.controller';
import { BidIQController } from '@/controllers/BidIQ.controller';
import { authenticateToken, optionalAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { resolveTenant, requireTenant } from '@/middleware/tenantContext';

const router = Router();

/**
 * Apply tenant resolution to all lead routes (no authentication required)
 */
router.use(resolveTenant);
router.use(requireTenant);
/**
 * Lead Routes
 */
// Allow lead creation with optional auth (to support extensions)
router.post('/', optionalAuth, requirePermission(Permissions.LEAD_CREATE),LeadController.createLead);

// Strictly protected routes
router.use(authenticateToken);

// 1. Specific non-parameterized routes
router.get('/trash', requirePermission(Permissions.LEAD_TRASH_READ), LeadController.getTrashLeads);
router.delete('/trash/empty', requirePermission(Permissions.LEAD_TRASH_DELETE), LeadController.emptyTrash);
router.post('/trash/bulk-restore', requirePermission(Permissions.LEAD_TRASH_RESTORE), LeadController.bulkRestoreLeads);
router.post('/trash/bulk-permanent-delete', requirePermission(Permissions.LEAD_TRASH_DELETE), LeadController.bulkPermanentlyDeleteLeads);
router.get('/attachments/download', LeadController.downloadAttachment);
router.post('/send-mail', LeadController.sendLeadMail);

// 2. Specific parameterized routes (/:id/*)
router.get('/:id/timeline', requirePermission(Permissions.LEAD_READ), LeadController.getLeadTimeline);
router.get('/:id/mails', requirePermission(Permissions.LEAD_READ), LeadController.getLeadMails);
router.post('/:id/analyze', requirePermission(Permissions.LEAD_MANAGE), BidIQController.analyzeLead);
router.post('/:id/onboard', requirePermission(Permissions.LEAD_MANAGE), LeadController.onboardLead);
router.post('/:id/restore', requirePermission(Permissions.LEAD_TRASH_RESTORE), LeadController.restoreLead);
router.delete('/:id/permanent', requirePermission(Permissions.LEAD_TRASH_DELETE), LeadController.permanentlyDeleteLead);

// 3. Generic parameterized routes (/:id)
router.get('/:id', requirePermission(Permissions.LEAD_READ), LeadController.getLead);
router.put('/:id', requirePermission(Permissions.LEAD_UPDATE), LeadController.updateLead);
router.delete('/:id', requirePermission(Permissions.LEAD_DELETE), LeadController.deleteLead);

// 4. Base routes
router.get('/', requirePermission(Permissions.LEAD_READ), LeadController.getLeads);


export default router;

