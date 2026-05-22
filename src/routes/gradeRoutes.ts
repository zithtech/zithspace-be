import express from "express";
import { GradeController } from "@/controllers/gradeController";
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requirePermission, requireAnyPermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = express.Router();

// Apply tenant context and authentication middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// Create a new grade
router.post("/", requirePermission(Permissions.ORG_GRADE_CREATE), GradeController.createGrade);

// Get all grades for the current tenant
router.get("/", requireAnyPermission(Permissions.ORG_GRADE_READ, Permissions.LEAVE_POLICY_READ, Permissions.LEAVE_POLICY_CREATE, Permissions.LEAVE_MANAGE), GradeController.getAllGrades);

// Get, Update, and Delete a specific grade by ID
router.get("/:id", requireAnyPermission(Permissions.ORG_GRADE_READ, Permissions.LEAVE_POLICY_READ, Permissions.LEAVE_POLICY_CREATE, Permissions.LEAVE_MANAGE), GradeController.getGradeById);
router.put("/:id", requirePermission(Permissions.ORG_GRADE_UPDATE), GradeController.updateGrade);
router.delete("/:id", requirePermission(Permissions.ORG_GRADE_DELETE), GradeController.deleteGrade);

export default router;