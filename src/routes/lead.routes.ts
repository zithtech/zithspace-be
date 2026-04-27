import { Router } from 'express';
import { LeadController } from '@/controllers/Lead.controller';
import { BidIQController } from '@/controllers/BidIQ.controller';
import { authenticateToken, optionalAuth } from '@/middleware/auth';
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
router.get('/', LeadController.getLeads);
router.get('/:id', LeadController.getLead);
router.put('/:id', LeadController.updateLead);
router.delete('/:id', LeadController.deleteLead);
router.post('/:id/analyze', BidIQController.analyzeLead);
router.post('/:id/onboard', LeadController.onboardLead);

export default router;
