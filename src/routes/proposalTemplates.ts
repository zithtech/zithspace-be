import { Router } from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { optionalTenantContext, resolveTenant } from '@/middleware/tenantContext';
import { ProposalTemplateController } from '@/controllers/ProposalTemplateController';

const router = Router();

// Template Library shares the Proposals permission set.
router.use(optionalTenantContext);
router.use(authenticateToken);
router.use(requireAuth);
router.use(resolveTenant);

// List templates (?archived=false to hide archived)
router.get('/', requirePermission(Permissions.PROPOSAL_READ), (req, res) => ProposalTemplateController.getTemplates(req, res));

// Single template
router.get('/:id', requirePermission(Permissions.PROPOSAL_READ), (req, res) => ProposalTemplateController.getTemplateById(req, res));

// Create
router.post('/', requirePermission(Permissions.PROPOSAL_CREATE), (req, res) => ProposalTemplateController.createTemplate(req, res));

// Duplicate
router.post('/:id/duplicate', requirePermission(Permissions.PROPOSAL_CREATE), (req, res) => ProposalTemplateController.duplicateTemplate(req, res));

// Update
router.put('/:id', requirePermission(Permissions.PROPOSAL_UPDATE), (req, res) => ProposalTemplateController.updateTemplate(req, res));

// Archive / restore
router.patch('/:id/archive', requirePermission(Permissions.PROPOSAL_UPDATE), (req, res) => ProposalTemplateController.archiveTemplate(req, res));

// Delete
router.delete('/:id', requirePermission(Permissions.PROPOSAL_DELETE), (req, res) => ProposalTemplateController.deleteTemplate(req, res));

export default router;
