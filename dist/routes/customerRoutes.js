"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const customerController_1 = require("@/controllers/customerController");
const router = (0, express_1.Router)();
// Resolve tenant for all customer routes
router.use(tenantContext_1.resolveTenant);
// Require login/auth for all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
// Get customers for dropdown/select
router.get("/select", (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_READ), customerController_1.CustomerController.getCustomersForSelect);
// Get all customers with pagination/filter
router.get("/", (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_READ), customerController_1.CustomerController.getCustomers);
// Get customer by ID
router.get("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_READ), customerController_1.CustomerController.getCustomerById);
// Create customer
router.post("/", (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_CREATE), customerController_1.CustomerController.createCustomer);
// Update customer (admin only)
router.put("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_UPDATE), customerController_1.CustomerController.updateCustomer);
// Delete customer (admin only)
router.delete("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.INVOICE_DELETE), customerController_1.CustomerController.deleteCustomer);
exports.default = router;
//# sourceMappingURL=customerRoutes.js.map