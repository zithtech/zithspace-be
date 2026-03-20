import express from "express";
import { getLeaveAllocationWithEmployees } from "@/controllers/leaveAllocationController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.get("/", getLeaveAllocationWithEmployees);


export default router;