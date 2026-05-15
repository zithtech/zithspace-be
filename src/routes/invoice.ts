

import { Router } from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { InvoiceController } from '@/controllers/InvoiceController';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';

const router = Router();

// Apply middleware
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);





// ==================== INVOICE ROUTES ====================

// Get all invoices (non-deleted)
router.get('/', requirePermission(Permissions.INVOICE_READ), (req, res) => InvoiceController.getInvoices(req, res));

// Get all soft-deleted invoices (trash)
router.get('/deleted', requirePermission(Permissions.INVOICE_TRASH_READ), (req, res) => InvoiceController.getDeletedInvoices(req, res));

// Get next invoice number for pre-filling in frontend
router.get('/next-number', requirePermission(Permissions.INVOICE_READ), (req, res) => InvoiceController.getNextInvoiceNumber(req, res));

// Get single invoice by ID
router.get('/:id', requirePermission(Permissions.INVOICE_READ), (req, res) => InvoiceController.getInvoiceById(req, res));

// Create new invoice
router.post('/', requirePermission(Permissions.INVOICE_CREATE), (req, res) => InvoiceController.createInvoice(req, res));

// Update invoice status
router.patch('/:id/status', requirePermission(Permissions.INVOICE_STATUS_UPDATE), (req, res) => InvoiceController.updateStatus(req, res));

// Soft delete invoice
router.delete('/:id', requirePermission(Permissions.INVOICE_DELETE), (req, res) => InvoiceController.deleteInvoice(req, res));

// Bulk soft delete invoices (Move to Trash)
router.post('/bulk-delete', requirePermission(Permissions.INVOICE_DELETE), (req, res) => InvoiceController.bulkDeleteInvoices(req, res));

// Restore soft-deleted invoice
router.patch('/:id/restore', requirePermission(Permissions.INVOICE_TRASH_UPDATE), (req, res) => InvoiceController.restoreInvoice(req, res));

// Bulk restore soft-deleted invoices
router.post('/bulk-restore', requirePermission(Permissions.INVOICE_TRASH_UPDATE), (req, res) => InvoiceController.bulkRestoreInvoices(req, res));

// Permanently delete invoice (hard delete) - Admin only
router.delete('/:id/permanent', requirePermission(Permissions.INVOICE_TRASH_DELETE), (req, res) => InvoiceController.permanentDeleteInvoice(req, res));

// Bulk permanently delete invoices
router.post('/bulk-permanent-delete', requirePermission(Permissions.INVOICE_TRASH_DELETE), (req, res) => InvoiceController.bulkPermanentDeleteInvoices(req, res));

// Update invoice
router.put('/:id', requirePermission(Permissions.INVOICE_UPDATE), (req, res) => InvoiceController.updateInvoice(req, res));

// Download invoice PDF
router.get('/:id/download', requirePermission(Permissions.INVOICE_READ), InvoiceController.downloadInvoice);

// Check PDF status
router.get('/:invoiceNumber/check-pdf', requirePermission(Permissions.INVOICE_READ), InvoiceController.checkPDFStatus);

// Get payment history for invoice
router.get('/:invoiceId/payments', requirePermission(Permissions.INVOICE_HISTORY_READ), InvoiceController.getPaymentHistory);

router.post('/:id/send', requirePermission(Permissions.INVOICE_MAIL_SEND), InvoiceController.sendEmail);




export default router;