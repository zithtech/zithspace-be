import express from "express";
import { getLeaveAllocationWithEmployees } from "@/controllers/leaveAllocationController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.get("/", requirePermission(Permissions.LEAVE_READ), getLeaveAllocationWithEmployees);


export default router;