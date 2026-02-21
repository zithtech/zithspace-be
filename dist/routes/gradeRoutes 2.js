"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const gradeController_1 = require("@/controllers/gradeController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = express_1.default.Router();
// Apply tenant context and authentication middleware to all routes
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
// Create a new grade
router.post("/", gradeController_1.GradeController.createGrade);
// Get all grades for the current tenant
router.get("/", gradeController_1.GradeController.getAllGrades);
// Get, Update, and Delete a specific grade by ID
router.get("/:id", gradeController_1.GradeController.getGradeById);
router.put("/:id", gradeController_1.GradeController.updateGrade);
router.delete("/:id", gradeController_1.GradeController.deleteGrade);
exports.default = router;
//# sourceMappingURL=gradeRoutes%202.js.map