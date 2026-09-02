"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const InvoiceController_1 = require("@/controllers/InvoiceController");
const permission_1 = require("@/middleware/permission");
const subscriptions_1 = require("@/modules/subscriptions");
const permissions_1 = require("@/types/permissions");
const router = (0, express_1.Router)();
// Apply middleware
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
router.use((0, subscriptions_1.requireSubscriptionFeature)('finance_invoice'));
// ==================== INVOICE ROUTES ====================
// Get all invoices (non-deleted)
router.get('/', (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_READ), (req, res) => InvoiceController_1.InvoiceController.getInvoices(req, res));
// Get all soft-deleted invoices (trash)
router.get('/deleted', (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_TRASH_READ), (req, res) => InvoiceController_1.InvoiceController.getDeletedInvoices(req, res));
// Get next invoice number for pre-filling in frontend
router.get('/next-number', (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_READ), (req, res) => InvoiceController_1.InvoiceController.getNextInvoiceNumber(req, res));
// Get single invoice by ID
router.get('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_READ), (req, res) => InvoiceController_1.InvoiceController.getInvoiceById(req, res));
// Create new invoice
router.post('/', (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_CREATE), (req, res) => InvoiceController_1.InvoiceController.createInvoice(req, res));
// Update invoice status
router.patch('/:id/status', (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_STATUS_UPDATE), (req, res) => InvoiceController_1.InvoiceController.updateStatus(req, res));
// Soft delete invoice
router.delete('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_DELETE), (req, res) => InvoiceController_1.InvoiceController.deleteInvoice(req, res));
// Bulk soft delete invoices (Move to Trash)
router.post('/bulk-delete', (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_DELETE), (req, res) => InvoiceController_1.InvoiceController.bulkDeleteInvoices(req, res));
// Restore soft-deleted invoice
router.patch('/:id/restore', (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_TRASH_UPDATE), (req, res) => InvoiceController_1.InvoiceController.restoreInvoice(req, res));
// Bulk restore soft-deleted invoices
router.post('/bulk-restore', (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_TRASH_UPDATE), (req, res) => InvoiceController_1.InvoiceController.bulkRestoreInvoices(req, res));
// Permanently delete invoice (hard delete) - Admin only
router.delete('/:id/permanent', (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_TRASH_DELETE), (req, res) => InvoiceController_1.InvoiceController.permanentDeleteInvoice(req, res));
// Bulk permanently delete invoices
router.post('/bulk-permanent-delete', (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_TRASH_DELETE), (req, res) => InvoiceController_1.InvoiceController.bulkPermanentDeleteInvoices(req, res));
// Update invoice
router.put('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_UPDATE), (req, res) => InvoiceController_1.InvoiceController.updateInvoice(req, res));
// Download invoice PDF
router.get('/:id/download', (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_READ), InvoiceController_1.InvoiceController.downloadInvoice);
// Check PDF status
router.get('/:invoiceNumber/check-pdf', (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_READ), InvoiceController_1.InvoiceController.checkPDFStatus);
// Get payment history for invoice
router.get('/:invoiceId/payments', (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_HISTORY_READ), InvoiceController_1.InvoiceController.getPaymentHistory);
router.post('/:id/send', (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_MAIL_SEND), InvoiceController_1.InvoiceController.sendEmail);
exports.default = router;
//# sourceMappingURL=invoice.js.map