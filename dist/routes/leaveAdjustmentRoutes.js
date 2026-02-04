"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const leaveAdjustmentController_1 = require("../controllers/leaveAdjustmentController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// Apply tenant context and authentication middleware to all routes
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
router.post("/", leaveAdjustmentController_1.createLeaveAdjustment);
router.get("/", leaveAdjustmentController_1.getLeaveAdjustments);
router.put("/:id", leaveAdjustmentController_1.updateLeaveAdjustment);
router.delete("/:id", leaveAdjustmentController_1.deleteLeaveAdjustment);
exports.default = router;
//# sourceMappingURL=leaveAdjustmentRoutes.js.map