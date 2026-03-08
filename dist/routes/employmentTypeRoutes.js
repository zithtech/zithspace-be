"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const employmentTypeController_1 = require("@/controllers/employmentTypeController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const router = (0, express_1.Router)();
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
router.post("/", (0, permission_1.requirePermission)(permissions_1.Permissions.ORG_MANAGE), employmentTypeController_1.EmploymentTypeController.createEmploymentType);
router.get("/", (0, permission_1.requirePermission)(permissions_1.Permissions.ORG_READ), employmentTypeController_1.EmploymentTypeController.getAllEmploymentTypes);
router.get("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.ORG_READ), employmentTypeController_1.EmploymentTypeController.getEmploymentTypeById);
router.put("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.ORG_MANAGE), employmentTypeController_1.EmploymentTypeController.updateEmploymentType);
router.delete("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.ORG_MANAGE), employmentTypeController_1.EmploymentTypeController.deleteEmploymentType);
exports.default = router;
//# sourceMappingURL=employmentTypeRoutes.js.map