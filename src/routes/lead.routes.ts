import { Router } from 'express';
import { LeadController } from '@/controllers/Lead.controller';
import { BidIQController } from '@/controllers/BidIQ.controller';
import { authenticateToken } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permission';
import { requireAiAccess } from '@/middleware/aiAccess';
import { Permissions } from '@/types/permissions';
import { resolveTenant, requireTenant } from '@/middleware/tenantContext';
import { requireSubscriptionFeature } from '@/modules/entitlements/entitlements.middleware';

const router = Router();

/**
 * Apply tenant resolution to all lead routes (no authentication required)
 */
router.use(resolveTenant);
router.use(requireTenant);
/**
 * Lead Routes
 */
// Lead creation requires a verified token; the lead's tenant is derived from
// the authenticated identity (JWT), never from a client-supplied tenant id.
router.post('/', authenticateToken, requirePermission(Permissions.LEAD_CREATE), requireSubscriptionFeature('work_lead_management_leads', { exact: false }), LeadController.createLead);

// Strictly protected routes
router.use(authenticateToken);

// 1. Specific non-parameterized routes
router.get('/trash', requirePermission(Permissions.LEAD_TRASH_READ), requireSubscriptionFeature('work_lead_management_lead_trash', { exact: false }), LeadController.getTrashLeads);
router.delete('/trash/empty', requirePermission(Permissions.LEAD_TRASH_DELETE), requireSubscriptionFeature('work_lead_management_lead_trash', { exact: false }), LeadController.emptyTrash);
router.post('/trash/bulk-restore', requirePermission(Permissions.LEAD_TRASH_RESTORE), requireSubscriptionFeature('work_lead_management_lead_trash', { exact: false }), LeadController.bulkRestoreLeads);
router.post('/trash/bulk-permanent-delete', requirePermission(Permissions.LEAD_TRASH_DELETE), requireSubscriptionFeature('work_lead_management_lead_trash', { exact: false }), LeadController.bulkPermanentlyDeleteLeads);
router.get('/attachments/download', LeadController.downloadAttachment);
router.post('/send-mail', LeadController.sendLeadMail);

// 2. Specific parameterized routes (/:id/*)
router.get('/:id/timeline', requirePermission(Permissions.LEAD_READ), requireSubscriptionFeature('work_lead_management_leads', { exact: false }), LeadController.getLeadTimeline);
router.get('/:id/mails', requirePermission(Permissions.LEAD_READ), requireSubscriptionFeature('work_lead_management_leads', { exact: false }), LeadController.getLeadMails);
router.post('/:id/analyze', requirePermission(Permissions.BIDIQ_CREATE), requireSubscriptionFeature('work_bidiq', { exact: false }), requireAiAccess, BidIQController.analyzeLead);
router.post('/:id/onboard', requirePermission(Permissions.LEAD_MANAGE), requireSubscriptionFeature('work_lead_management_leads', { exact: false }), LeadController.onboardLead);
router.post('/:id/restore', requirePermission(Permissions.LEAD_TRASH_RESTORE), requireSubscriptionFeature('work_lead_management_lead_trash', { exact: false }), LeadController.restoreLead);
router.delete('/:id/permanent', requirePermission(Permissions.LEAD_TRASH_DELETE), requireSubscriptionFeature('work_lead_management_lead_trash', { exact: false }), LeadController.permanentlyDeleteLead);

// 3. Generic parameterized routes (/:id)
router.get('/:id', requirePermission(Permissions.LEAD_READ), requireSubscriptionFeature('work_lead_management_leads', { exact: false }), LeadController.getLead);
router.put('/:id', requirePermission(Permissions.LEAD_UPDATE), requireSubscriptionFeature('work_lead_management_leads', { exact: false }), LeadController.updateLead);
router.delete('/:id', requirePermission(Permissions.LEAD_DELETE), requireSubscriptionFeature('work_lead_management_leads', { exact: false }), LeadController.deleteLead);

// 4. Base routes
router.get('/', requirePermission(Permissions.LEAD_READ), requireSubscriptionFeature('work_lead_management_leads', { exact: false }), LeadController.getLeads);

export default router;

