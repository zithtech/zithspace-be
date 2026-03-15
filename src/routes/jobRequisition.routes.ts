import { Router } from "express";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import {
  createRequisition,
  getRequisitions,
  getRequisitionById,
  updateRequisition,
  deleteRequisition,
  deleteRequisitions,
} from "../controllers/jobRequisition.controller";

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", createRequisition);
router.get("/", getRequisitions);
router.get("/:id", getRequisitionById);
router.put("/:id", updateRequisition);
router.delete("/:id", deleteRequisition);
router.delete("/bulk/delete", deleteRequisitions);

export default router;
