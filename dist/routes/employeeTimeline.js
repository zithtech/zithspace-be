"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const employeeTimelineController_1 = require("@/controllers/employeeTimelineController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = express_1.default.Router();
// ================= GLOBAL MIDDLEWARE =================
// Tenant context + Auth apply to all employee timeline routes
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
// ================= EMPLOYEE TIMELINE ROUTES =================
// Create employee timeline
router.post("/", employeeTimelineController_1.EmployeeTimelineController.createTimeline);
// Get timeline by employeeId
router.get("/employee/:employeeId", employeeTimelineController_1.EmployeeTimelineController.getTimelineByEmployee);
// Get timeline by timeline ID
router.get("/:id", employeeTimelineController_1.EmployeeTimelineController.getTimelineById);
// Update employee timeline
router.put("/:id", employeeTimelineController_1.EmployeeTimelineController.updateTimeline);
// Delete employee timeline
router.delete("/:id", employeeTimelineController_1.EmployeeTimelineController.deleteTimeline);
exports.default = router;
//# sourceMappingURL=employeeTimeline.js.map