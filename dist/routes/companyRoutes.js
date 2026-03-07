"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const companyController_1 = require("@/controllers/companyController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const router = (0, express_1.Router)();
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/**
 * Companies
 */
router.get("/", (0, permission_1.requirePermission)(permissions_1.Permissions.SALARY_READ), companyController_1.CompanyController.getCompanies);
router.get("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.SALARY_READ), companyController_1.CompanyController.getCompanyById);
router.post("/", (0, permission_1.requirePermission)(permissions_1.Permissions.SALARY_MANAGE), companyController_1.CompanyController.createCompany);
router.put("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.SALARY_MANAGE), companyController_1.CompanyController.updateCompany);
router.patch("/:id/active", (0, permission_1.requirePermission)(permissions_1.Permissions.SALARY_MANAGE), companyController_1.CompanyController.setActiveCompany);
router.delete("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.SALARY_MANAGE), companyController_1.CompanyController.deleteCompany);
exports.default = router;
//# sourceMappingURL=companyRoutes.js.map