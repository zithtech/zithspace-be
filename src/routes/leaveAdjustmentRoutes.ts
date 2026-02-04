import { Router } from "express";
import {
  createLeaveAdjustment,
  getLeaveAdjustments,
  updateLeaveAdjustment,
  deleteLeaveAdjustment,
} from "../controllers/leaveAdjustmentController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

// Apply tenant context and authentication middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", createLeaveAdjustment);
router.get("/", getLeaveAdjustments);
router.put("/:id", updateLeaveAdjustment);
router.delete("/:id", deleteLeaveAdjustment);

export default router;