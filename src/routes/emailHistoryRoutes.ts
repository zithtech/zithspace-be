// zithspace-be/src/routes/emailHistoryRoutes.ts

import { Router } from 'express';
import { EmailHistoryController } from '@/controllers/emailHistoryController';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requirePermission, requireAnyPermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = Router();

// All routes require authentication
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// Email history routes
router.get('/', requireAnyPermission(Permissions.SETTINGS_READ, Permissions.INVOICE_HISTORY_READ, Permissions.INVOICE_READ), EmailHistoryController.getEmailLogs);
router.get('/modules', requireAnyPermission(Permissions.SETTINGS_READ, Permissions.INVOICE_HISTORY_READ, Permissions.INVOICE_READ), EmailHistoryController.getModules);
router.get('/stats', requireAnyPermission(Permissions.SETTINGS_READ, Permissions.INVOICE_HISTORY_READ, Permissions.INVOICE_READ), EmailHistoryController.getStats);
router.get('/:id', requireAnyPermission(Permissions.SETTINGS_READ, Permissions.INVOICE_HISTORY_READ, Permissions.INVOICE_READ), EmailHistoryController.getEmailLogById);

// Module-specific routes
router.get('/invoice/:invoiceId', requirePermission(Permissions.INVOICE_HISTORY_READ), EmailHistoryController.getInvoiceEmailHistory);

export default router;