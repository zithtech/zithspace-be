// import express from "express";
// import { EmployeeController } from "@/controllers/employeeController";
// import { authenticateToken, requireAuth } from "@/middleware/auth";
// import { resolveTenant } from "@/middleware/tenantContext";

// const router = express.Router();

// // ================= GLOBAL MIDDLEWARE =================
// // Tenant context + Auth apply to all employee routes
// router.use(resolveTenant);
// router.use(authenticateToken);
// router.use(requireAuth);

// // ================= EMPLOYEE ROUTES =================

// // Create a new employee
// router.post("/", EmployeeController.createEmployee);

// // Get all employees for current tenant
// router.get("/", EmployeeController.getEmployees);

// // Get employee by ID
// router.get("/:id", EmployeeController.getEmployeeById);

// // Update employee
// router.put("/:id", EmployeeController.updateEmployee);

// // Delete employee
// router.delete("/:id", EmployeeController.deleteEmployee);

// export default router;
