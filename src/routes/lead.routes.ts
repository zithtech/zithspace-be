import { Router } from 'express';
import { LeadController } from '@/controllers/Lead.controller';
import { authenticateToken } from '@/middleware/auth';
import { resolveTenant, requireTenant } from '@/middleware/tenantContext';

const router = Router();

/**
 * Apply tenant resolution to all lead routes
 */
router.use(resolveTenant);
router.use(requireTenant);
router.use(authenticateToken);

/**
 * Lead Routes
 */
router.post('/', LeadController.createLead);
router.get('/', LeadController.getLeads);
router.get('/:id', LeadController.getLead);
router.put('/:id', LeadController.updateLead);
router.delete('/:id', LeadController.deleteLead);

export default router;
