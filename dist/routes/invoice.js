"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const InvoiceController_1 = require("@/controllers/InvoiceController");
const router = (0, express_1.Router)();
// Apply middleware
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/**
 * Using arrow functions ensures 'this' context is maintained
 * or that the static methods are called directly on the class.
 */
// router.get('/', (req, res) => InvoiceController.getInvoices(req, res));
// router.get('/next-number', (req, res) => InvoiceController.getNextInvoiceNumber(req, res));
// router.get('/:id', (req, res) => InvoiceController.getInvoiceById(req, res));
// router.post('/', (req, res) => InvoiceController.createInvoice(req, res));
// router.patch('/:id/status', (req, res) => InvoiceController.updateStatus(req, res));
// router.delete('/:id', (req, res) => InvoiceController.deleteInvoice(req, res));
// router.put('/:id', (req, res) => InvoiceController.updateInvoice(req, res));
// router.get('/:id/download', InvoiceController.downloadInvoice);
// router.get('/:invoiceNumber/check-pdf', InvoiceController.checkPDFStatus);
// router.get('/:invoiceId/payments', InvoiceController.getPaymentHistory);
// ==================== INVOICE ROUTES ====================
// Get all invoices (non-deleted)
router.get('/', (req, res) => InvoiceController_1.InvoiceController.getInvoices(req, res));
// Get all soft-deleted invoices (trash)
router.get('/deleted', (req, res) => InvoiceController_1.InvoiceController.getDeletedInvoices(req, res));
// Get next invoice number for pre-filling in frontend
router.get('/next-number', (req, res) => InvoiceController_1.InvoiceController.getNextInvoiceNumber(req, res));
// Get single invoice by ID
router.get('/:id', (req, res) => InvoiceController_1.InvoiceController.getInvoiceById(req, res));
// Create new invoice
router.post('/', (req, res) => InvoiceController_1.InvoiceController.createInvoice(req, res));
// Update invoice status
router.patch('/:id/status', (req, res) => InvoiceController_1.InvoiceController.updateStatus(req, res));
// Soft delete invoice
router.delete('/:id', (req, res) => InvoiceController_1.InvoiceController.deleteInvoice(req, res));
// Restore soft-deleted invoice
router.patch('/:id/restore', (req, res) => InvoiceController_1.InvoiceController.restoreInvoice(req, res));
// Permanently delete invoice (hard delete) - Admin only
router.delete('/:id/permanent', (req, res) => InvoiceController_1.InvoiceController.permanentDeleteInvoice(req, res));
// Update invoice
router.put('/:id', (req, res) => InvoiceController_1.InvoiceController.updateInvoice(req, res));
// Download invoice PDF
router.get('/:id/download', InvoiceController_1.InvoiceController.downloadInvoice);
// Check PDF status
router.get('/:invoiceNumber/check-pdf', InvoiceController_1.InvoiceController.checkPDFStatus);
// Get payment history for invoice
router.get('/:invoiceId/payments', InvoiceController_1.InvoiceController.getPaymentHistory);
router.post('/:id/send', InvoiceController_1.InvoiceController.sendEmail);
exports.default = router;
//# sourceMappingURL=invoice.js.map