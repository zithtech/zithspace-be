"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const companyGovernmentHoliday_controller_1 = require("../controllers/companyGovernmentHoliday.controller");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// Apply auth middleware to all routes
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
router.post('/', companyGovernmentHoliday_controller_1.CompanyGovernmentHolidayController.create);
router.get('/', companyGovernmentHoliday_controller_1.CompanyGovernmentHolidayController.getAll);
router.get('/:id', companyGovernmentHoliday_controller_1.CompanyGovernmentHolidayController.getById);
router.put('/:id', companyGovernmentHoliday_controller_1.CompanyGovernmentHolidayController.update);
router.delete('/:id', companyGovernmentHoliday_controller_1.CompanyGovernmentHolidayController.delete);
exports.default = router;
//# sourceMappingURL=companyGovernmentHoliday.routes.js.map