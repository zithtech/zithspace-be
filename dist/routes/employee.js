"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const employeeController_1 = require("@/controllers/employeeController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = express_1.default.Router();
// Apply tenant context and authentication middleware to all routes
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
// Create a new employee
router.post("/", employeeController_1.EmployeeController.createEmployee);
// Get all employees
router.get("/", employeeController_1.EmployeeController.getEmployees);
// Get a specific employee by ID
router.get("/:id", employeeController_1.EmployeeController.getEmployeeById);
// Update an employee
router.put("/:id", employeeController_1.EmployeeController.updateEmployee);
// Delete an employee
router.delete("/:id", employeeController_1.EmployeeController.deleteEmployee);
exports.default = router;
//# sourceMappingURL=employee.js.map