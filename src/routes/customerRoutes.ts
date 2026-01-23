// import { Router } from "express";
// import { CustomerController } from "@/controllers/customerController";
// import {
//   authenticateToken,
//   requireAuth,
//   requireAdmin,
// } from "@/middleware/auth";
// import { resolveTenant } from "@/middleware/tenantContext";

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

import { Router } from "express";
import { CustomerController } from "@/controllers/customerController";
// import auth and tenant middleware
// import { authenticateToken, requireAuth, requireAdmin } from "@/middleware/auth";
// import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

// TEMP: skip tenant and auth for testing
// router.use(resolveTenant);
// router.use(authenticateToken);
// router.use(requireAuth);

router.get("/select", CustomerController.getCustomersForSelect);
router.get("/", CustomerController.getCustomers);
router.get("/:id", CustomerController.getCustomerById);
router.post("/", CustomerController.createCustomer);
router.put("/:id", CustomerController.updateCustomer);
router.delete("/:id", CustomerController.deleteCustomer);

export default router;
