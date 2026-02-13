// zithspace-be/src/routes/emailHistoryRoutes.ts

import { Router } from 'express';
import { EmailHistoryController } from '@/controllers/emailHistoryController';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// All routes require authentication
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// Email history routes
router.get('/', EmailHistoryController.getEmailLogs);
router.get('/modules', EmailHistoryController.getModules);
router.get('/stats', EmailHistoryController.getStats);
router.get('/:id', EmailHistoryController.getEmailLogById);

// Module-specific routes
router.get('/invoice/:invoiceId', EmailHistoryController.getInvoiceEmailHistory);

export default router;