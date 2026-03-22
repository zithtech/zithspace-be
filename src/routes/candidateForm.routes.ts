import { Router } from "express";
import {
  submitCandidateForm,
  getCandidates,
  getCandidateById,
  updateCandidate,
  deleteCandidate
} from "@/controllers/candidateForm.controller";
import { optionalTenantContext } from "@/middleware/tenantContext";

const router = Router();

// Publicly accessible for submission, but still needs tenant context
router.post("/", optionalTenantContext, submitCandidateForm);

// CRUD routes (authenticated/with tenant context)
router.get("/", optionalTenantContext, getCandidates);
router.get("/:id", optionalTenantContext, getCandidateById);
router.put("/:id", optionalTenantContext, updateCandidate);
router.delete("/:id", optionalTenantContext, deleteCandidate);

export default router;
