import { Router } from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

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
  ReimbursementCategoryController.createCategory
);

// Get all categories
router.get(
  "/",
  ReimbursementCategoryController.getCategories
);

// Get category by id
router.get(
  "/:id",
  ReimbursementCategoryController.getCategoryById
);

// Update category
router.put(
  "/:id",
  ReimbursementCategoryController.updateCategory
);

// Soft delete category
router.delete(
  "/:id",
  ReimbursementCategoryController.deleteCategory
);

export default router;
