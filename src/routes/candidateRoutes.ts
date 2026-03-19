import express from "express";
import {
  createCandidate,
  getCandidates,
  getCandidateById,
  updateCandidate,
  deleteCandidate,
} from "@/controllers/candidateController";

import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = express.Router();

// Apply tenant + authentication middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// Create candidate
router.post("/", createCandidate);

// Get all candidates
router.get("/", getCandidates);

// Get candidate by ID
router.get("/:id", getCandidateById);

// Update candidate
router.put("/:id", updateCandidate);

// Delete candidate
router.delete("/:id", deleteCandidate);

export default router;