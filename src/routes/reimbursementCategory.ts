import { Router } from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);
import ReimbursementCategoryController from "@/controllers/reimbursementCategoryController";


// ==============================
// REIMBURSEMENT CATEGORY ROUTES
// ==============================

// Create category
router.post(
  "/",
  requirePermission(Permissions.REIMBURSEMENT_MANAGE),
  ReimbursementCategoryController.createCategory
);

// Get all categories
router.get(
  "/",
  requirePermission(Permissions.REIMBURSEMENT_READ),
  ReimbursementCategoryController.getCategories
);

// Get category by id
router.get(
  "/:id",
  requirePermission(Permissions.REIMBURSEMENT_READ),
  ReimbursementCategoryController.getCategoryById
);

// Update category
router.put(
  "/:id",
  requirePermission(Permissions.REIMBURSEMENT_MANAGE),
  ReimbursementCategoryController.updateCategory
);

// Soft delete category
router.delete(
  "/:id",
  requirePermission(Permissions.REIMBURSEMENT_MANAGE),
  ReimbursementCategoryController.deleteCategory
);

export default router;
