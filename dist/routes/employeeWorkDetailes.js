"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const employeeWorkDetailesController_1 = require("@/controllers/employeeWorkDetailesController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const router = (0, express_1.Router)();
/* ================= EMPLOYEE WORK DETAIL ROUTES ================= */
///
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
// CREATE work detail
router.post("/", (0, permission_1.requirePermission)(permissions_1.Permissions.ONBOARDING_CREATE), employeeWorkDetailesController_1.EmployeeWorkDetailController.createWorkDetail);
// GET work detail by employeeId
router.get("/employee/:employeeId", (0, permission_1.requirePermission)(permissions_1.Permissions.ONBOARDING_READ), employeeWorkDetailesController_1.EmployeeWorkDetailController.getWorkDetailByEmployee);
// GET work detail by id
router.get("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.ONBOARDING_READ), employeeWorkDetailesController_1.EmployeeWorkDetailController.getWorkDetailById);
// UPDATE work detail
router.put("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.ONBOARDING_UPDATE), employeeWorkDetailesController_1.EmployeeWorkDetailController.updateWorkDetail);
// DELETE work detail
router.delete("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.ONBOARDING_DELETE), employeeWorkDetailesController_1.EmployeeWorkDetailController.deleteWorkDetail);
exports.default = router;
//# sourceMappingURL=employeeWorkDetailes.js.map