import { Router } from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { InvoiceTemplateController } from '@/controllers/InvoiceTemplateController';

const router = Router();

// Apply middleware
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ==================== INVOICE TEMPLATE ROUTES ====================

// Get all templates
router.get('/', requirePermission(Permissions.INVOICE_READ), InvoiceTemplateController.getTemplates);

// Get template by ID
router.get('/:id', requirePermission(Permissions.INVOICE_READ), InvoiceTemplateController.getTemplateById);

// Create new template
router.post('/', requirePermission(Permissions.INVOICE_CREATE), InvoiceTemplateController.createTemplate);

// Update template
router.put('/:id', requirePermission(Permissions.INVOICE_UPDATE), InvoiceTemplateController.updateTemplate);

// Delete template
router.delete('/:id', requirePermission(Permissions.INVOICE_DELETE), InvoiceTemplateController.deleteTemplate);

export default router;
