import express from "express";
import { EmployeeOnboardingController } from "@/controllers/employeeOnboardingController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = express.Router();

const asyncHandler = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// GLOBAL MIDDLEWARE
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ROUTES
router.post("/", asyncHandler(EmployeeOnboardingController.create));
router.get("/", asyncHandler(EmployeeOnboardingController.getAll));
router.get("/:employeeId", asyncHandler(EmployeeOnboardingController.getById));
router.put("/:employeeId", asyncHandler(EmployeeOnboardingController.update));
router.delete(
  "/:employeeId",
  asyncHandler(EmployeeOnboardingController.delete),
);

export default router;
