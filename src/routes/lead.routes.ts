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
router.post('/', optionalAuth, LeadController.createLead);

// Strictly protected routes
router.use(authenticateToken);
router.get('/', requirePermission(Permissions.LEAD_READ), LeadController.getLeads);
router.get('/:id', requirePermission(Permissions.LEAD_READ), LeadController.getLead);
router.put('/:id', requirePermission(Permissions.LEAD_UPDATE), LeadController.updateLead);
router.delete('/:id', requirePermission(Permissions.LEAD_DELETE), LeadController.deleteLead);
router.post('/:id/analyze', requirePermission(Permissions.LEAD_MANAGE), BidIQController.analyzeLead);
router.post('/:id/onboard', requirePermission(Permissions.LEAD_MANAGE), LeadController.onboardLead);

export default router;
