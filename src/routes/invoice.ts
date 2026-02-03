

import { Router } from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { InvoiceController } from '@/controllers/InvoiceController';

const router = Router();

// Apply middleware
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * Using arrow functions ensures 'this' context is maintained
 * or that the static methods are called directly on the class.
 */
router.get('/', (req, res) => InvoiceController.getInvoices(req, res));
// Get next invoice number for pre-filling in frontend
router.get('/next-number', (req, res) => InvoiceController.getNextInvoiceNumber(req, res));
router.get('/:id', (req, res) => InvoiceController.getInvoiceById(req, res));
router.post('/', (req, res) => InvoiceController.createInvoice(req, res));
router.patch('/:id/status', (req, res) => InvoiceController.updateStatus(req, res));
router.delete('/:id', (req, res) => InvoiceController.deleteInvoice(req, res));
router.put('/:id', (req, res) => InvoiceController.updateInvoice(req, res));

router.get('/:id/download', InvoiceController.downloadInvoice);

router.get('/:invoiceNumber/check-pdf', InvoiceController.checkPDFStatus);


router.get('/:invoiceId/payments', InvoiceController.getPaymentHistory);




export default router;