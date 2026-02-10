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
router.get("/", salaryComponentController_1.SalaryComponentController.getSalaryComponents);
router.get("/:id", salaryComponentController_1.SalaryComponentController.getSalaryComponentById);
router.post("/", salaryComponentController_1.SalaryComponentController.createSalaryComponent);
router.put("/:id", salaryComponentController_1.SalaryComponentController.updateSalaryComponent);
router.patch("/:id/status", salaryComponentController_1.SalaryComponentController.updateSalaryStatus);
router.delete("/:id", salaryComponentController_1.SalaryComponentController.deleteSalaryComponent);
exports.default = router;
//# sourceMappingURL=salaryComponentRoutes.js.map