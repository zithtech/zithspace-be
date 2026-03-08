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
router.post("/", (0, permission_1.requirePermission)(permissions_1.Permissions.ORG_MANAGE), departmentController_1.DepartmentController.createDepartment);
router.get("/", (0, permission_1.requirePermission)(permissions_1.Permissions.ORG_READ), departmentController_1.DepartmentController.getAllDepartments);
router.get("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.ORG_READ), departmentController_1.DepartmentController.getDepartmentById);
router.put("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.ORG_MANAGE), departmentController_1.DepartmentController.updateDepartment);
router.delete("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.ORG_MANAGE), departmentController_1.DepartmentController.deleteDepartment);
exports.default = router;
//# sourceMappingURL=departmentRoutes%202.js.map