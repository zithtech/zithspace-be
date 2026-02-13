// import express from "express";
// import { EmployeeAddressController } from "@/controllers/employeeAddressController";
// import { authenticateToken, requireAuth } from "@/middleware/auth";
// import { resolveTenant } from "@/middleware/tenantContext";

// const router = express.Router();

// // ================= GLOBAL MIDDLEWARE =================
// // Tenant context + Auth apply to all employee address routes
// router.use(resolveTenant);
// router.use(authenticateToken);
// router.use(requireAuth);

// // ================= EMPLOYEE ADDRESS ROUTES =================

// // Create employee address
// router.post("/", EmployeeAddressController.createEmployeeAddress);

// // Get all employee addresses (current tenant)
// router.get("/", EmployeeAddressController.getEmployeeAddresses);

// // Get employee address by ID
// router.get("/:id", EmployeeAddressController.getEmployeeAddressById);

// // Update employee address
// router.put("/:id", EmployeeAddressController.updateEmployeeAddress);

// // Delete employee address
// router.delete("/:id", EmployeeAddressController.deleteEmployeeAddress);

// export default router;
