"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const fixedHoliday_controller_1 = require("@/controllers/fixedHoliday.controller");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = express_1.default.Router();
// Apply tenant context and authentication middleware to all routes
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
// Create a new fixed holiday
router.post("/", fixedHoliday_controller_1.FixedHolidayController.createFixedHoliday);
// Get all fixed holidays for the current tenant
router.get("/", fixedHoliday_controller_1.FixedHolidayController.getFixedHolidays);
// Get a specific fixed holiday by ID
router.get("/:id", fixedHoliday_controller_1.FixedHolidayController.getFixedHolidayById);
// Update a fixed holiday
router.put("/:id", fixedHoliday_controller_1.FixedHolidayController.updateFixedHoliday);
// Delete a fixed holiday
router.delete("/:id", fixedHoliday_controller_1.FixedHolidayController.deleteFixedHoliday);
exports.default = router;
//# sourceMappingURL=fixedHolidays.js.map