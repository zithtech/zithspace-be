"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
const reimbursementCategoryController_1 = require("@/controllers/reimbursementCategoryController");
// ==============================
// REIMBURSEMENT CATEGORY ROUTES
// ==============================
// Create category
router.post("/", reimbursementCategoryController_1.ReimbursementCategoryController.createCategory);
// Get all categories
router.get("/", reimbursementCategoryController_1.ReimbursementCategoryController.getCategories);
// Get category by id
router.get("/:id", reimbursementCategoryController_1.ReimbursementCategoryController.getCategoryById);
// Update category
router.put("/:id", reimbursementCategoryController_1.ReimbursementCategoryController.updateCategory);
// Soft delete category
router.delete("/:id", reimbursementCategoryController_1.ReimbursementCategoryController.deleteCategory);
exports.default = router;
//# sourceMappingURL=reimbursementCategory.js.map