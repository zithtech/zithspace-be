import express from "express";
import { EmployeeOnboardingController } from "@/controllers/employeeOnboardingController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = express.Router();

const asyncHandler = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// GLOBAL MIDDLEWARE
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ROUTES
router.post("/", requirePermission(Permissions.ONBOARDING_CREATE), asyncHandler(EmployeeOnboardingController.create));
router.get("/", requirePermission(Permissions.ONBOARDING_READ), asyncHandler(EmployeeOnboardingController.getAll));
// Must be placed before /:employeeId to prevent 'birthdays' from being treated as an employeeId parameter
router.get("/birthdays", requirePermission(Permissions.ONBOARDING_READ), asyncHandler(EmployeeOnboardingController.getUpcomingBirthdays));
router.get("/:employeeId", requirePermission(Permissions.ONBOARDING_READ), asyncHandler(EmployeeOnboardingController.getById));
router.put("/:employeeId", requirePermission(Permissions.ONBOARDING_UPDATE), asyncHandler(EmployeeOnboardingController.update));
router.delete(
  "/:employeeId",
  requirePermission(Permissions.ONBOARDING_MANAGE),
  asyncHandler(EmployeeOnboardingController.delete),
);

export default router;
