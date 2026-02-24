"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const employee_address_controller_1 = require("@/controllers/employee_address_controller");
const auth_1 = require("@/middleware/auth");
const router = express_1.default.Router();
// 🔐 Authentication middleware (common for all address routes)
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/* ---------------- ADDRESS ROUTES ---------------- */
// Create a new address
// POST /addresses
router.post("/", employee_address_controller_1.AddressController.createAddress);
// Get addresses by employee
// GET /addresses/employee/:employeeId
router.get("/employee/:employeeId", employee_address_controller_1.AddressController.getAddressesByEmployee);
// Update address by id
// PUT /addresses/:id
router.put("/:id", employee_address_controller_1.AddressController.updateAddress);
// Delete address by id
// DELETE /addresses/:id
router.delete("/:id", employee_address_controller_1.AddressController.deleteAddress);
exports.default = router;
//# sourceMappingURL=employee_address.js.map