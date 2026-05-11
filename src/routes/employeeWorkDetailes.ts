import { Router } from "express";
import { EmployeeWorkDetailController } from "@/controllers/employeeWorkDetailesController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";
const router = Router();

/* ================= EMPLOYEE WORK DETAIL ROUTES ================= */
///
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);
// CREATE work detail
router.post(
  "/",
  requirePermission(Permissions.ONBOARDING_CREATE),
  EmployeeWorkDetailController.createWorkDetail,
);

// GET work detail by employeeId
router.get(
  "/employee/:employeeId",
  requirePermission(Permissions.ONBOARDING_READ),
  EmployeeWorkDetailController.getWorkDetailByEmployee,
);

// GET work detail by id
router.get(
  "/:id",
  requirePermission(Permissions.ONBOARDING_READ),
  EmployeeWorkDetailController.getWorkDetailById,
);

// UPDATE work detail
router.put(
  "/:id",
  requirePermission(Permissions.ONBOARDING_UPDATE),
  EmployeeWorkDetailController.updateWorkDetail,
);

// DELETE work detail
router.delete(
  "/:id",
  requirePermission(Permissions.ONBOARDING_DELETE),
  EmployeeWorkDetailController.deleteWorkDetail,
);

export default router;
