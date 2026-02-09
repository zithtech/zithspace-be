import express from "express";
import {
  createLeaveOriginStructure,
  createOriginLeaveType,
  updateLeaveOriginStructure,
  getAllLeaveOrigins,
  deleteLeaveOriginStructure,
  deleteOriginLeaveType,
  updateOriginLeaveType
} from "@/controllers/leaveOriginController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant, requireTenant } from "@/middleware/tenantContext";

const router = express.Router();

// Apply middleware to ensure user is authenticated and tenant is identified
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);
router.use(requireTenant);

router.get("/", getAllLeaveOrigins);
router.post("/structure", createLeaveOriginStructure);
router.put("/structure/:id", updateLeaveOriginStructure);
router.post("/type", createOriginLeaveType);
router.put("/type/:id", updateOriginLeaveType);
router.delete("/structure/:id", deleteLeaveOriginStructure);
router.delete("/type/:id", deleteOriginLeaveType);

export default router;