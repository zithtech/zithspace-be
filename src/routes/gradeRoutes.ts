import express from "express";
import { GradeController } from "@/controllers/gradeController";
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = express.Router();

// Apply tenant context and authentication middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// Create a new grade
router.post("/", GradeController.createGrade);

// Get all grades for the current tenant
router.get("/", GradeController.getAllGrades);

// Get, Update, and Delete a specific grade by ID
router.get("/:id", GradeController.getGradeById);
router.put("/:id", GradeController.updateGrade);
router.delete("/:id", GradeController.deleteGrade);

export default router;