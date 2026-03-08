"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const leaveTypeController_1 = require("@/controllers/leaveTypeController");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
// Routes
router.post("/", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_MANAGE), leaveTypeController_1.LeaveTypeController.createLeaveType);
router.get("/", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_READ), leaveTypeController_1.LeaveTypeController.getAllLeaveTypes);
router.get("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_READ), leaveTypeController_1.LeaveTypeController.getLeaveTypeById);
router.put("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_MANAGE), leaveTypeController_1.LeaveTypeController.updateLeaveType);
router.delete("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_MANAGE), leaveTypeController_1.LeaveTypeController.deleteLeaveType);
exports.default = router;
//# sourceMappingURL=leaveTypeRoutes.js.map