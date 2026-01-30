import { Router } from "express";

import {
  authenticateToken,
  requireAuth,
  requireAdmin,
} from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { CustomerController } from "@/controllers/customerController";

const router = Router();

// Resolve tenant for all customer routes
router.use(resolveTenant);

// Require login/auth for all routes
router.use(authenticateToken);
router.use(requireAuth);


// Get customers for dropdown/select
router.get("/select", CustomerController.getCustomersForSelect);

// Get all customers with pagination/filter
router.get("/", CustomerController.getCustomers);

// Get customer by ID
router.get("/:id", CustomerController.getCustomerById);

// Create customer
router.post("/", CustomerController.createCustomer);

// Update customer (admin only)
router.put("/:id", CustomerController.updateCustomer);

// Delete customer (admin only)
router.delete("/:id", CustomerController.deleteCustomer);

export default router;

