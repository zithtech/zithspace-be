import express from "express";
import {
  createExitType,
  getExitTypes,
  getExitTypeById,
  updateExitType,
  deleteExitType,
} from "../controllers/exitType.controller";
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = express.Router();

// Apply auth middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", createExitType);
router.get("/", getExitTypes);
router.get("/:id", getExitTypeById);
router.put("/:id", updateExitType);
router.delete("/:id", deleteExitType);

export default router;
