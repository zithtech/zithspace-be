"use strict";
// zithspace-be/src/routes/emailHistoryRoutes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const emailHistoryController_1 = require("@/controllers/emailHistoryController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// All routes require authentication
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
// Email history routes
router.get('/', emailHistoryController_1.EmailHistoryController.getEmailLogs);
router.get('/modules', emailHistoryController_1.EmailHistoryController.getModules);
router.get('/stats', emailHistoryController_1.EmailHistoryController.getStats);
router.get('/:id', emailHistoryController_1.EmailHistoryController.getEmailLogById);
// Module-specific routes
router.get('/invoice/:invoiceId', emailHistoryController_1.EmailHistoryController.getInvoiceEmailHistory);
exports.default = router;
//# sourceMappingURL=emailHistoryRoutes.js.map