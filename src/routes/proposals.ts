import { Router } from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { optionalTenantContext, resolveTenant } from '@/middleware/tenantContext';
import { ProposalController } from '@/controllers/ProposalController';

const router = Router();

// Apply global middleware for these routes
router.use(optionalTenantContext);
router.use(authenticateToken);
router.use(requireAuth);
router.use(resolveTenant);

// Get all proposals
router.get('/', (req, res) => ProposalController.getProposals(req, res));

// Get single proposal
router.get('/:id', (req, res) => ProposalController.getProposalById(req, res));

// Create new proposal
router.post('/', (req, res) => ProposalController.createProposal(req, res));

// Update proposal
router.put('/:id', (req, res) => ProposalController.updateProposal(req, res));

// Delete proposal
router.delete('/:id', (req, res) => ProposalController.deleteProposal(req, res));

// Export proposal (PDF & Word)
router.post('/:id/export', (req, res) => ProposalController.exportProposal(req, res));

// Generate proposal from lead using AI (Saves to DB)
router.post('/generate-from-lead/:leadId', (req, res) => ProposalController.generateFromLead(req, res));

// Generate proposal content ONLY (Does not save to DB)
router.post('/generate-content-only/:leadId', (req, res) => ProposalController.generateContentOnly(req, res));

// Refine a block or sub-section with AI
router.post('/refine-block', (req, res) => ProposalController.refineBlock(req, res));

export default router;
