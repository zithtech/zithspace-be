"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const departmentController_1 = require("@/controllers/departmentController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const router = (0, express_1.Router)();
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
router.post("/", (0, permission_1.requirePermission)(permissions_1.Permissions.ORG_DEPARTMENT_CREATE), departmentController_1.DepartmentController.createDepartment);
router.get("/", (0, permission_1.requireAnyPermission)(permissions_1.Permissions.ORG_DEPARTMENT_READ, permissions_1.Permissions.LEAVE_POLICY_READ, permissions_1.Permissions.LEAVE_POLICY_CREATE, permissions_1.Permissions.LEAVE_MANAGE), departmentController_1.DepartmentController.getAllDepartments);
router.get("/:id", (0, permission_1.requireAnyPermission)(permissions_1.Permissions.ORG_DEPARTMENT_READ, permissions_1.Permissions.LEAVE_POLICY_READ, permissions_1.Permissions.LEAVE_POLICY_CREATE, permissions_1.Permissions.LEAVE_MANAGE), departmentController_1.DepartmentController.getDepartmentById);
router.put("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.ORG_DEPARTMENT_UPDATE), departmentController_1.DepartmentController.updateDepartment);
router.delete("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.ORG_DEPARTMENT_DELETE), departmentController_1.DepartmentController.deleteDepartment);
exports.default = router;
//# sourceMappingURL=departmentRoutes.js.map