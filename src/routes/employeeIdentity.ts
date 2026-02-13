// import express from "express";
// import { EmployeeIdentityController } from "@/controllers/employeeIdentityController";
// import { authenticateToken, requireAuth } from "@/middleware/auth";
// import { resolveTenant } from "@/middleware/tenantContext";

// const router = express.Router();

// // ================= GLOBAL MIDDLEWARE =================
// router.use(resolveTenant);
// router.use(authenticateToken);
// router.use(requireAuth);

// // ================= EMPLOYEE IDENTITY ROUTES =================

// // Create employee identity
// router.post("/", EmployeeIdentityController.createIdentity);

// // Get identity by employeeId
// router.get(
//   "/employee/:employeeId",
//   EmployeeIdentityController.getIdentityByEmployee,
// );

// // Get identity by id
// router.get("/:id", EmployeeIdentityController.getIdentityById);

// // Update employee identity
// router.put("/:id", EmployeeIdentityController.updateIdentity);

// // Delete employee identity
// router.delete("/:id", EmployeeIdentityController.deleteIdentity);

// export default router;
