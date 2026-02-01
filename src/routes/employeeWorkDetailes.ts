import { Router } from "express";
import { EmployeeWorkDetailController } from "@/controllers/employeeWorkDetailesController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
const router = Router();

/* ================= EMPLOYEE WORK DETAIL ROUTES ================= */

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);
// CREATE work detail
router.post(
  "/",

  EmployeeWorkDetailController.createWorkDetail,
);

// GET work detail by employeeId
router.get(
  "/employee/:employeeId",

  EmployeeWorkDetailController.getWorkDetailByEmployee,
);

// GET work detail by id
router.get(
  "/:id",

  EmployeeWorkDetailController.getWorkDetailById,
);

// UPDATE work detail
router.put(
  "/:id",

  EmployeeWorkDetailController.updateWorkDetail,
);

// DELETE work detail
router.delete(
  "/:id",

  EmployeeWorkDetailController.deleteWorkDetail,
);

export default router;
