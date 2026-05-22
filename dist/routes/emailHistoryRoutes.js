"use strict";
// zithspace-be/src/routes/emailHistoryRoutes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const emailHistoryController_1 = require("@/controllers/emailHistoryController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const router = (0, express_1.Router)();
// All routes require authentication
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
// Email history routes
router.get('/', (0, permission_1.requireAnyPermission)(permissions_1.Permissions.SETTINGS_READ, permissions_1.Permissions.INVOICE_HISTORY_READ, permissions_1.Permissions.INVOICE_READ), emailHistoryController_1.EmailHistoryController.getEmailLogs);
router.get('/modules', (0, permission_1.requireAnyPermission)(permissions_1.Permissions.SETTINGS_READ, permissions_1.Permissions.INVOICE_HISTORY_READ, permissions_1.Permissions.INVOICE_READ), emailHistoryController_1.EmailHistoryController.getModules);
router.get('/stats', (0, permission_1.requireAnyPermission)(permissions_1.Permissions.SETTINGS_READ, permissions_1.Permissions.INVOICE_HISTORY_READ, permissions_1.Permissions.INVOICE_READ), emailHistoryController_1.EmailHistoryController.getStats);
router.get('/:id', (0, permission_1.requireAnyPermission)(permissions_1.Permissions.SETTINGS_READ, permissions_1.Permissions.INVOICE_HISTORY_READ, permissions_1.Permissions.INVOICE_READ), emailHistoryController_1.EmailHistoryController.getEmailLogById);
// Module-specific routes
router.get('/invoice/:invoiceId', (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_HISTORY_READ), emailHistoryController_1.EmailHistoryController.getInvoiceEmailHistory);
exports.default = router;
//# sourceMappingURL=emailHistoryRoutes.js.map