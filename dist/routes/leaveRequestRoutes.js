"use strict";
// src/routes/leaveRequestRoutes.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const leaverequestcontroller_1 = require("@/controllers/leaverequestcontroller");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = express_1.default.Router();
// Apply middleware to all routes in this file
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
router.use(tenantContext_1.requireTenant);
router.post("/", leaverequestcontroller_1.applyLeave);
router.get("/", leaverequestcontroller_1.getLeaveRequests);
router.put("/:id/status", leaverequestcontroller_1.updateLeaveStatus);
router.put("/:id/cancel", leaverequestcontroller_1.cancelLeaveRequest);
exports.default = router;
//# sourceMappingURL=leaveRequestRoutes.js.map