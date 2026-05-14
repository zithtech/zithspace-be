"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const leaveOriginController_1 = require("@/controllers/leaveOriginController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const router = express_1.default.Router();
// Apply middleware to ensure user is authenticated and tenant is identified
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
router.use(tenantContext_1.requireTenant);
router.get("/", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_POLICY_READ), leaveOriginController_1.getAllLeaveOrigins);
router.post("/structure", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_POLICY_CREATE), leaveOriginController_1.createLeaveOriginStructure);
router.put("/structure/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_POLICY_UPDATE), leaveOriginController_1.updateLeaveOriginStructure);
router.post("/type", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_POLICY_CREATE), leaveOriginController_1.createOriginLeaveType);
router.put("/type/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_POLICY_UPDATE), leaveOriginController_1.updateOriginLeaveType);
router.delete("/structure/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_POLICY_DELETE), leaveOriginController_1.deleteLeaveOriginStructure);
router.delete("/type/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_POLICY_DELETE), leaveOriginController_1.deleteOriginLeaveType);
exports.default = router;
//# sourceMappingURL=leaveOriginRoutes.js.map