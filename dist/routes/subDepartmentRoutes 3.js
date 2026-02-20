"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const subDepartmentController_1 = require("@/controllers/subDepartmentController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = express_1.default.Router();
// Apply authentication and tenant context middleware to all routes
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
router.post("/", subDepartmentController_1.SubDepartmentController.createSubDepartment);
router.get("/", subDepartmentController_1.SubDepartmentController.getAllSubDepartments);
router.get("/:id", subDepartmentController_1.SubDepartmentController.getSubDepartmentById);
router.put("/:id", subDepartmentController_1.SubDepartmentController.updateSubDepartment);
router.delete("/:id", subDepartmentController_1.SubDepartmentController.deleteSubDepartment);
exports.default = router;
//# sourceMappingURL=subDepartmentRoutes%203.js.map