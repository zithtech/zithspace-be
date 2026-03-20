import express from "express";
import {
  createStep,
  getAllSteps,
  getStepById,
  updateStep,
  deleteStep,
} from "../controllers/exitApprovalWorkflow.controller";
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = express.Router();

// Apply auth middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", createStep);
router.get("/", getAllSteps);
router.get("/:id", getStepById);
router.put("/:id", updateStep);
router.delete("/:id", deleteStep);

export default router;
