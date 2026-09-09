"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const subDepartmentController_1 = require("@/controllers/subDepartmentController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const permission_1 = require("@/middleware/permission");
const entitlements_middleware_1 = require("@/modules/entitlements/entitlements.middleware");
const permissions_1 = require("@/types/permissions");
const router = express_1.default.Router();
// Apply authentication and tenant context middleware to all routes
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
router.post("/", (0, permission_1.requirePermission)(permissions_1.Permissions.ORG_DEPARTMENT_CREATE), (0, entitlements_middleware_1.requireSubscriptionFeature)("admin_org_structure_sub_department", { exact: false }), subDepartmentController_1.SubDepartmentController.createSubDepartment);
router.get("/", (0, permission_1.requireAnyPermission)(permissions_1.Permissions.ORG_DEPARTMENT_READ, permissions_1.Permissions.LEAVE_POLICY_READ, permissions_1.Permissions.LEAVE_POLICY_CREATE, permissions_1.Permissions.LEAVE_MANAGE), subDepartmentController_1.SubDepartmentController.getAllSubDepartments);
router.get("/:id", (0, permission_1.requireAnyPermission)(permissions_1.Permissions.ORG_DEPARTMENT_READ, permissions_1.Permissions.LEAVE_POLICY_READ, permissions_1.Permissions.LEAVE_POLICY_CREATE, permissions_1.Permissions.LEAVE_MANAGE), subDepartmentController_1.SubDepartmentController.getSubDepartmentById);
router.put("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.ORG_DEPARTMENT_UPDATE), (0, entitlements_middleware_1.requireSubscriptionFeature)("admin_org_structure_sub_department", { exact: false }), subDepartmentController_1.SubDepartmentController.updateSubDepartment);
router.delete("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.ORG_DEPARTMENT_DELETE), (0, entitlements_middleware_1.requireSubscriptionFeature)("admin_org_structure_sub_department", { exact: false }), subDepartmentController_1.SubDepartmentController.deleteSubDepartment);
exports.default = router;
//# sourceMappingURL=subDepartmentRoutes.js.map