"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const salaryComponentController_1 = require("@/controllers/salaryComponentController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/**
 * Salary Components
 */
router.get("/", salaryComponentController_1.SalaryComponentController.getComponents);
router.get("/:id", salaryComponentController_1.SalaryComponentController.getComponentById);
router.post("/", auth_1.requireAdmin, salaryComponentController_1.SalaryComponentController.createComponent);
router.put("/:id", auth_1.requireAdmin, salaryComponentController_1.SalaryComponentController.updateComponent);
router.patch("/:id/status", auth_1.requireAdmin, salaryComponentController_1.SalaryComponentController.updateStatus);
exports.default = router;
//# sourceMappingURL=salaryComponentRoutes.js.map