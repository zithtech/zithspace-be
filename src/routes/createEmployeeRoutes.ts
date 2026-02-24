import express from "express";
import { createPersonalDetails } from "@/controllers/createEmployeeDetailes";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = express.Router();

// ================= GLOBAL MIDDLEWARE =================
// Tenant context + Auth apply to all employee-details routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ================= EMPLOYEE DETAILS ROUTES =================

// CREATE - All details at once
// router.post("/", createPersonalDetails.createEmployeeDetails);

// // GET ALL - Employee with address + emergency + identity
// router.get("/", createPersonalDetails.getEmployeeDetails);

// // GET BY ID - Single employee full details
// router.get("/:id", createPersonalDetails.getEmployeeDetailsById);

// // UPDATE - Full employee details
// router.put("/:id", createPersonalDetails.updateEmployeeDetails);

// // DELETE - Employee + all related records
// router.delete("/:id", createPersonalDetails.deleteEmployeeDetails);

// export default router;
