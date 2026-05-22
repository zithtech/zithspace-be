"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const positionController_1 = require("@/controllers/positionController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const router = express_1.default.Router();
// Apply tenant context and authentication middleware to all routes
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
router.post("/", (0, permission_1.requirePermission)(permissions_1.Permissions.ORG_POSITION_CREATE), positionController_1.PositionController.createPosition);
router.get("/", (0, permission_1.requireAnyPermission)(permissions_1.Permissions.ORG_POSITION_READ, permissions_1.Permissions.LEAVE_POLICY_READ, permissions_1.Permissions.LEAVE_POLICY_CREATE, permissions_1.Permissions.LEAVE_MANAGE), positionController_1.PositionController.getPositions);
router.get("/:id", (0, permission_1.requireAnyPermission)(permissions_1.Permissions.ORG_POSITION_READ, permissions_1.Permissions.LEAVE_POLICY_READ, permissions_1.Permissions.LEAVE_POLICY_CREATE, permissions_1.Permissions.LEAVE_MANAGE), positionController_1.PositionController.getPositionById);
router.put("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.ORG_POSITION_UPDATE), positionController_1.PositionController.updatePosition);
router.delete("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.ORG_POSITION_DELETE), positionController_1.PositionController.deletePosition);
exports.default = router;
//# sourceMappingURL=positionRoutes.js.map