"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = express_1.default.Router();
// ================= GLOBAL MIDDLEWARE =================
// Tenant context + Auth apply to all employee-details routes
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
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
//# sourceMappingURL=createEmployeeRoutes.js.map