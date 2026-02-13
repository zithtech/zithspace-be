// import express from "express";
// import { EmployeeEmergencyContactController } from "@/controllers/employeeEmergencyContact";
// import { authenticateToken, requireAuth } from "@/middleware/auth";
// import { resolveTenant } from "@/middleware/tenantContext";

// const router = express.Router();

// // ================= GLOBAL MIDDLEWARE =================
// router.use(resolveTenant);
// router.use(authenticateToken);
// router.use(requireAuth);

// // ================= EMERGENCY CONTACT ROUTES =================

// // Create emergency contact
// router.post("/", EmployeeEmergencyContactController.createContact);

// // Get all contacts by employeeId
// router.get(
//   "/employee/:employeeId",
//   EmployeeEmergencyContactController.getContactsByEmployee,
// );

// // Get contact by id
// router.get("/:id", EmployeeEmergencyContactController.getContactById);

// // Update emergency contact
// router.put("/:id", EmployeeEmergencyContactController.updateContact);

// // Delete emergency contact
// router.delete("/:id", EmployeeEmergencyContactController.deleteContact);

// export default router;
