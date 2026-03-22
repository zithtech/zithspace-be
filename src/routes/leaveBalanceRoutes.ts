// src/routes/leaveBalanceRoutes.ts

import express from "express";
import { getLeaveBalances } from "@/controllers/leaveBalanceController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.get("/", getLeaveBalances);

export default router;