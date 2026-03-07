// zithspace-be/src/routes/emailHistoryRoutes.ts

import { Router } from 'express';
import { EmailHistoryController } from '@/controllers/emailHistoryController';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = Router();

// All routes require authentication
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// Email history routes
router.get('/', requirePermission(Permissions.SETTINGS_READ), EmailHistoryController.getEmailLogs);
router.get('/modules', requirePermission(Permissions.SETTINGS_READ), EmailHistoryController.getModules);
router.get('/stats', requirePermission(Permissions.SETTINGS_READ), EmailHistoryController.getStats);
router.get('/:id', requirePermission(Permissions.SETTINGS_READ), EmailHistoryController.getEmailLogById);

// Module-specific routes
router.get('/invoice/:invoiceId', requirePermission(Permissions.INVOICE_READ), EmailHistoryController.getInvoiceEmailHistory);

export default router;