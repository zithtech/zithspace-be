

import { Router } from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { InvoiceController } from '@/controllers/InvoiceController';

const router = Router();

// Apply middleware
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);





// ==================== INVOICE ROUTES ====================

// Get all invoices (non-deleted)
router.get('/', (req, res) => InvoiceController.getInvoices(req, res));

// Get all soft-deleted invoices (trash)
router.get('/deleted', (req, res) => InvoiceController.getDeletedInvoices(req, res));

// Get next invoice number for pre-filling in frontend
router.get('/next-number', (req, res) => InvoiceController.getNextInvoiceNumber(req, res));

// Get single invoice by ID
router.get('/:id', (req, res) => InvoiceController.getInvoiceById(req, res));

// Create new invoice
router.post('/', (req, res) => InvoiceController.createInvoice(req, res));

// Update invoice status
router.patch('/:id/status', (req, res) => InvoiceController.updateStatus(req, res));

// Soft delete invoice
router.delete('/:id', (req, res) => InvoiceController.deleteInvoice(req, res));

// Restore soft-deleted invoice
router.patch('/:id/restore', (req, res) => InvoiceController.restoreInvoice(req, res));

// Permanently delete invoice (hard delete) - Admin only
router.delete('/:id/permanent', (req, res) => InvoiceController.permanentDeleteInvoice(req, res));

// Update invoice
router.put('/:id', (req, res) => InvoiceController.updateInvoice(req, res));

// Download invoice PDF
router.get('/:id/download', InvoiceController.downloadInvoice);

// Check PDF status
router.get('/:invoiceNumber/check-pdf', InvoiceController.checkPDFStatus);

// Get payment history for invoice
router.get('/:invoiceId/payments', InvoiceController.getPaymentHistory);

router.post('/:id/send', InvoiceController.sendEmail);




export default router;