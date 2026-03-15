"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const leaveAdjustmentController_1 = require("../controllers/leaveAdjustmentController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const router = (0, express_1.Router)();
// Apply tenant context and authentication middleware to all routes
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
router.post("/", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_MANAGE), leaveAdjustmentController_1.createLeaveAdjustment);
router.get("/", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_MANAGE), leaveAdjustmentController_1.getLeaveAdjustments);
router.put("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_MANAGE), leaveAdjustmentController_1.updateLeaveAdjustment);
router.delete("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_MANAGE), leaveAdjustmentController_1.deleteLeaveAdjustment);
exports.default = router;
//# sourceMappingURL=leaveAdjustmentRoutes.js.map