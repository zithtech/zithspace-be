import express from "express";
import {
  createNoticePolicy,
  getAllNoticePolicies,
  getNoticePolicyById,
  updateNoticePolicy,
  deleteNoticePolicy,
} from "../controllers/noticePolicy.controller";
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = express.Router();

// Apply auth middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", createNoticePolicy);
router.get("/", getAllNoticePolicies);
router.get("/:id", getNoticePolicyById);
router.put("/:id", updateNoticePolicy);
router.delete("/:id", deleteNoticePolicy);

export default router;
