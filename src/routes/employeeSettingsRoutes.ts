import express from "express";
import {
  createEmployeeSettings,
  getEmployeeSettings,
  updateEmployeeSettings,
  deleteEmployeeSettings,
} from "@/controllers/employeeSettingController";

import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const asyncHandler = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", asyncHandler(createEmployeeSettings));
router.get("/", asyncHandler(getEmployeeSettings));
router.put("/:id", asyncHandler(updateEmployeeSettings));
router.delete("/:id", asyncHandler(deleteEmployeeSettings));

export default router;
