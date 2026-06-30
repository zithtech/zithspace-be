import { Router } from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { optionalTenantContext, resolveTenant } from '@/middleware/tenantContext';
import { ProposalController } from '@/controllers/ProposalController';

const router = Router();

// Apply global middleware for these routes
router.use(optionalTenantContext);
router.use(authenticateToken);
router.use(requireAuth);
router.use(resolveTenant);

// Get all proposals
router.get('/', requirePermission(Permissions.PROPOSAL_READ), (req, res) => ProposalController.getProposals(req, res));

// Get all trashed proposals
router.get('/trash', requirePermission(Permissions.PROPOSAL_READ), (req, res) => ProposalController.getTrashedProposals(req, res));

// Empty trash
router.delete('/trash/empty', requirePermission(Permissions.PROPOSAL_DELETE), (req, res) => ProposalController.emptyTrash(req, res));

// Get single proposal
router.get('/:id', requirePermission(Permissions.PROPOSAL_READ), (req, res) => ProposalController.getProposalById(req, res));

// Restore trashed proposal
router.post('/:id/restore', requirePermission(Permissions.PROPOSAL_UPDATE), (req, res) => ProposalController.restoreProposal(req, res));

// Hard delete proposal
router.delete('/:id/hard', requirePermission(Permissions.PROPOSAL_DELETE), (req, res) => ProposalController.hardDeleteProposal(req, res));

// Create new proposal
router.post('/', requirePermission(Permissions.PROPOSAL_CREATE), (req, res) => ProposalController.createProposal(req, res));

// Update proposal
router.put('/:id', requirePermission(Permissions.PROPOSAL_UPDATE), (req, res) => ProposalController.updateProposal(req, res));

// Delete proposal
router.delete('/:id', requirePermission(Permissions.PROPOSAL_DELETE), (req, res) => ProposalController.deleteProposal(req, res));

// Export proposal (PDF & Word)
router.post('/:id/export', requirePermission(Permissions.PROPOSAL_READ), (req, res) => ProposalController.exportProposal(req, res));

// Generate proposal from lead using AI (Saves to DB)
router.post('/generate-from-lead/:leadId', requirePermission(Permissions.PROPOSAL_CREATE), (req, res) => ProposalController.generateFromLead(req, res));

// Generate proposal content ONLY (Does not save to DB)
router.post('/generate-content-only/:leadId', requirePermission(Permissions.PROPOSAL_CREATE), (req, res) => ProposalController.generateContentOnly(req, res));

// Refine a block or sub-section with AI
router.post('/refine-block', requirePermission(Permissions.PROPOSAL_UPDATE), (req, res) => ProposalController.refineBlock(req, res));

export default router;
