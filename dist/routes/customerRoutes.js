"use strict";
// import { Router } from "express";
// import { CustomerController } from "@/controllers/customerController";
// import {
//   authenticateToken,
//   requireAuth,
//   requireAdmin,
// } from "@/middleware/auth";
// import { resolveTenant } from "@/middleware/tenantContext";
Object.defineProperty(exports, "__esModule", { value: true });
// const router = Router();
// // Resolve tenant for all customer routes
// router.use(resolveTenant);
// // Require login/auth for all routes
// router.use(authenticateToken);
// router.use(requireAuth);
// // Get customers for dropdown/select
// router.get("/select", CustomerController.getCustomersForSelect);
// // Get all customers with pagination/filter
// router.get("/", CustomerController.getCustomers);
// // Get customer by ID
// router.get("/:id", CustomerController.getCustomerById);
// // Create customer
// router.post("/", CustomerController.createCustomer);
// // Update customer (admin only)
// router.put("/:id", requireAdmin, CustomerController.updateCustomer);
// // Delete customer (admin only)
// router.delete("/:id", requireAdmin, CustomerController.deleteCustomer);
// export default router;
const express_1 = require("express");
const customerController_1 = require("@/controllers/customerController");
// import auth and tenant middleware
// import { authenticateToken, requireAuth, requireAdmin } from "@/middleware/auth";
// import { resolveTenant } from "@/middleware/tenantContext";
const router = (0, express_1.Router)();
// TEMP: skip tenant and auth for testing
// router.use(resolveTenant);
// router.use(authenticateToken);
// router.use(requireAuth);
router.get("/select", customerController_1.CustomerController.getCustomersForSelect);
router.get("/", customerController_1.CustomerController.getCustomers);
router.get("/:id", customerController_1.CustomerController.getCustomerById);
router.post("/", customerController_1.CustomerController.createCustomer);
router.put("/:id", customerController_1.CustomerController.updateCustomer);
router.delete("/:id", customerController_1.CustomerController.deleteCustomer);
exports.default = router;
//# sourceMappingURL=customerRoutes.js.map