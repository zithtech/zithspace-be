"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reimbursementCategory_controller_1 = __importDefault(require("@/controllers/reimbursementCategory.controller"));
const auth_1 = __importDefault(require("@/middleware/auth"));
const router = (0, express_1.Router)();
router.use(auth_1.default.authenticateToken);
router.post("/", reimbursementCategory_controller_1.default.createCategory);
router.get("/", reimbursementCategory_controller_1.default.getCategories);
router.get("/:id", reimbursementCategory_controller_1.default.getCategoryById);
router.put("/:id", reimbursementCategory_controller_1.default.updateCategory);
router.delete("/:id", reimbursementCategory_controller_1.default.deleteCategory);
exports.default = router;
//# sourceMappingURL=reimbursement.js.map