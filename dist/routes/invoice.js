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
router.get('/', (req, res) => InvoiceController_1.InvoiceController.getInvoices(req, res));
// Get next invoice number for pre-filling in frontend
router.get('/next-number', (req, res) => InvoiceController_1.InvoiceController.getNextInvoiceNumber(req, res));
router.get('/:id', (req, res) => InvoiceController_1.InvoiceController.getInvoiceById(req, res));
router.post('/', (req, res) => InvoiceController_1.InvoiceController.createInvoice(req, res));
router.patch('/:id/status', (req, res) => InvoiceController_1.InvoiceController.updateStatus(req, res));
router.delete('/:id', (req, res) => InvoiceController_1.InvoiceController.deleteInvoice(req, res));
router.put('/:id', (req, res) => InvoiceController_1.InvoiceController.updateInvoice(req, res));
router.get('/:id/download', InvoiceController_1.InvoiceController.downloadInvoice);
router.get('/:invoiceNumber/check-pdf', InvoiceController_1.InvoiceController.checkPDFStatus);
router.get('/:invoiceId/payments', InvoiceController_1.InvoiceController.getPaymentHistory);
exports.default = router;
//# sourceMappingURL=invoice.js.map