"use strict";
// src/routes/leaveBalanceRoutes.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const leaveBalanceController_1 = require("@/controllers/leaveBalanceController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const router = express_1.default.Router();
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
router.get("/", (0, permission_1.requirePermission)(permissions_1.Permissions.LEAVE_READ), leaveBalanceController_1.getLeaveBalances);
exports.default = router;
//# sourceMappingURL=leaveBalanceRoutes.js.map