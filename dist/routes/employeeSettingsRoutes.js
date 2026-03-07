"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const employeeSettingController_1 = require("@/controllers/employeeSettingController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const router = express_1.default.Router();
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
router.post("/", asyncHandler(employeeSettingController_1.createEmployeeSettings));
router.get("/", asyncHandler(employeeSettingController_1.getEmployeeSettings));
router.put("/:id", asyncHandler(employeeSettingController_1.updateEmployeeSettings));
router.delete("/:id", asyncHandler(employeeSettingController_1.deleteEmployeeSettings));
exports.default = router;
//# sourceMappingURL=employeeSettingsRoutes.js.map