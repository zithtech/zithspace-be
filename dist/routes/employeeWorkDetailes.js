"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const employeeWorkDetailesController_1 = require("@/controllers/employeeWorkDetailesController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
/* ================= EMPLOYEE WORK DETAIL ROUTES ================= */
///
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
// CREATE work detail
router.post("/", employeeWorkDetailesController_1.EmployeeWorkDetailController.createWorkDetail);
// GET work detail by employeeId
router.get("/employee/:employeeId", employeeWorkDetailesController_1.EmployeeWorkDetailController.getWorkDetailByEmployee);
// GET work detail by id
router.get("/:id", employeeWorkDetailesController_1.EmployeeWorkDetailController.getWorkDetailById);
// UPDATE work detail
router.put("/:id", employeeWorkDetailesController_1.EmployeeWorkDetailController.updateWorkDetail);
// DELETE work detail
router.delete("/:id", employeeWorkDetailesController_1.EmployeeWorkDetailController.deleteWorkDetail);
exports.default = router;
//# sourceMappingURL=employeeWorkDetailes.js.map