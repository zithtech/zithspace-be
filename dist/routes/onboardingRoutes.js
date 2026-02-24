"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const employeeOnboardingController_1 = require("@/controllers/employeeOnboardingController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = express_1.default.Router();
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
// GLOBAL MIDDLEWARE
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
// ROUTES
router.post("/", asyncHandler(employeeOnboardingController_1.EmployeeOnboardingController.create));
router.get("/", asyncHandler(employeeOnboardingController_1.EmployeeOnboardingController.getAll));
router.get("/:employeeId", asyncHandler(employeeOnboardingController_1.EmployeeOnboardingController.getById));
router.put("/:employeeId", asyncHandler(employeeOnboardingController_1.EmployeeOnboardingController.update));
router.delete("/:employeeId", asyncHandler(employeeOnboardingController_1.EmployeeOnboardingController.delete));
exports.default = router;
//# sourceMappingURL=onboardingRoutes.js.map