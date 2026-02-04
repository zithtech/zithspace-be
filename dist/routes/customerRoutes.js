"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const customerController_1 = require("@/controllers/customerController");
const router = (0, express_1.Router)();
// Resolve tenant for all customer routes
router.use(tenantContext_1.resolveTenant);
// Require login/auth for all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
// Get customers for dropdown/select
router.get("/select", customerController_1.CustomerController.getCustomersForSelect);
// Get all customers with pagination/filter
router.get("/", customerController_1.CustomerController.getCustomers);
// Get customer by ID
router.get("/:id", customerController_1.CustomerController.getCustomerById);
// Create customer
router.post("/", customerController_1.CustomerController.createCustomer);
// Update customer (admin only)
router.put("/:id", customerController_1.CustomerController.updateCustomer);
// Delete customer (admin only)
router.delete("/:id", customerController_1.CustomerController.deleteCustomer);
exports.default = router;
//# sourceMappingURL=customerRoutes.js.map