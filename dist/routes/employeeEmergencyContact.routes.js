"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const employeeEmergencyContact_1 = require("@/controllers/employeeEmergencyContact");
const auth_1 = require("@/middleware/auth");
const router = express_1.default.Router();
// Apply authentication middleware to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
// Create a new emergency contact
router.post("/", employeeEmergencyContact_1.EmployeeEmergencyContactController.createContact);
// Get all contacts for a specific employee
router.get("/employee/:employeeId", employeeEmergencyContact_1.EmployeeEmergencyContactController.getContactsByEmployee);
// Get a specific contact by ID
router.get("/:id", employeeEmergencyContact_1.EmployeeEmergencyContactController.getContactById);
// Update a contact
router.put("/:id", employeeEmergencyContact_1.EmployeeEmergencyContactController.updateContact);
// Delete a contact
router.delete("/:id", employeeEmergencyContact_1.EmployeeEmergencyContactController.deleteContact);
exports.default = router;
//# sourceMappingURL=employeeEmergencyContact.routes.js.map