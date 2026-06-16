import { Router } from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { optionalTenantContext, resolveTenant } from '@/middleware/tenantContext';
import { ProposalSectionController } from '@/controllers/ProposalSectionController';

const router = Router();

// Section Library shares the Proposals permission set.
router.use(optionalTenantContext);
router.use(authenticateToken);
router.use(requireAuth);
router.use(resolveTenant);

// List sections (?archived=false to hide archived)
router.get('/', requirePermission(Permissions.PROPOSAL_READ), (req, res) => ProposalSectionController.getSections(req, res));

// Single section
router.get('/:id', requirePermission(Permissions.PROPOSAL_READ), (req, res) => ProposalSectionController.getSectionById(req, res));

// Create
router.post('/', requirePermission(Permissions.PROPOSAL_CREATE), (req, res) => ProposalSectionController.createSection(req, res));

// Duplicate
router.post('/:id/duplicate', requirePermission(Permissions.PROPOSAL_CREATE), (req, res) => ProposalSectionController.duplicateSection(req, res));

// Update
router.put('/:id', requirePermission(Permissions.PROPOSAL_UPDATE), (req, res) => ProposalSectionController.updateSection(req, res));

// Archive / restore
router.patch('/:id/archive', requirePermission(Permissions.PROPOSAL_UPDATE), (req, res) => ProposalSectionController.archiveSection(req, res));

// Delete
router.delete('/:id', requirePermission(Permissions.PROPOSAL_DELETE), (req, res) => ProposalSectionController.deleteSection(req, res));

export default router;
