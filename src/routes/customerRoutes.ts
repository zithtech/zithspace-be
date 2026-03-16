import { Router } from "express";

import {
  authenticateToken,
  requireAuth,
} from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";
import { CustomerController } from "@/controllers/customerController";

const router = Router();

// Resolve tenant for all customer routes
router.use(resolveTenant);

// Require login/auth for all routes
router.use(authenticateToken);
router.use(requireAuth);


// Get customers for dropdown/select
router.get("/select", requirePermission(Permissions.INVOICE_READ), CustomerController.getCustomersForSelect);

// Get all customers with pagination/filter
router.get("/", requirePermission(Permissions.INVOICE_READ), CustomerController.getCustomers);

// Get customer by ID
router.get("/:id", requirePermission(Permissions.INVOICE_READ), CustomerController.getCustomerById);

// Create customer
router.post("/", requirePermission(Permissions.INVOICE_CREATE), CustomerController.createCustomer);

// Update customer (admin only)
router.put("/:id", requirePermission(Permissions.INVOICE_UPDATE), CustomerController.updateCustomer);

// Delete customer (admin only)
router.delete("/:id", requirePermission(Permissions.INVOICE_DELETE), CustomerController.deleteCustomer);

export default router;

