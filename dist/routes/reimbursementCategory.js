"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
const reimbursementCategoryController_1 = __importDefault(require("@/controllers/reimbursementCategoryController"));
// ==============================
// REIMBURSEMENT CATEGORY ROUTES
// ==============================
// Create category
router.post("/", (0, permission_1.requirePermission)(permissions_1.Permissions.REIMBURSEMENT_MANAGE), reimbursementCategoryController_1.default.createCategory);
// Get all categories
router.get("/", (0, permission_1.requirePermission)(permissions_1.Permissions.REIMBURSEMENT_READ), reimbursementCategoryController_1.default.getCategories);
// Get category by id
router.get("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.REIMBURSEMENT_READ), reimbursementCategoryController_1.default.getCategoryById);
// Update category
router.put("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.REIMBURSEMENT_MANAGE), reimbursementCategoryController_1.default.updateCategory);
// Soft delete category
router.delete("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.REIMBURSEMENT_MANAGE), reimbursementCategoryController_1.default.deleteCategory);
exports.default = router;
//# sourceMappingURL=reimbursementCategory.js.map