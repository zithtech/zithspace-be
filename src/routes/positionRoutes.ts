import express from "express";
import { PositionController } from "@/controllers/positionController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission, requireAnyPermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = express.Router();

// Apply tenant context and authentication middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", requirePermission(Permissions.ORG_POSITION_CREATE), PositionController.createPosition);
router.get("/", requireAnyPermission(Permissions.ORG_POSITION_READ, Permissions.LEAVE_POLICY_READ, Permissions.LEAVE_POLICY_CREATE, Permissions.LEAVE_MANAGE), PositionController.getPositions);
router.get("/:id", requireAnyPermission(Permissions.ORG_POSITION_READ, Permissions.LEAVE_POLICY_READ, Permissions.LEAVE_POLICY_CREATE, Permissions.LEAVE_MANAGE), PositionController.getPositionById);
router.put("/:id", requirePermission(Permissions.ORG_POSITION_UPDATE), PositionController.updatePosition);
router.delete("/:id", requirePermission(Permissions.ORG_POSITION_DELETE), PositionController.deletePosition);

export default router;
