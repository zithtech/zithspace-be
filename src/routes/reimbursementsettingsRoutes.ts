import { Router } from "express";
import ReimbursementSettingsCategoriesController 
  from "@/controllers/reimbursementsettingsController";
import { authenticateToken, requireAuth, requireAdmin } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

// Middleware: tenant resolution & authentication
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/* ================== REIMBURSEMENT SETTINGS CATEGORY ROUTES ================== */

/**
 * @route   GET /api/reimbursement-settings-categories
 * @desc    Get all reimbursement categories
 * @access  Private
 */
router.get(
  "/",
  ReimbursementSettingsCategoriesController.getCategories
);

/**
 * @route   GET /api/reimbursement-settings-categories/:id
 * @desc    Get single reimbursement category by ID
 * @access  Private
 */
router.get(
  "/:id",
  ReimbursementSettingsCategoriesController.getCategoryById
);

/**
 * @route   POST /api/reimbursement-settings-categories
 * @desc    Create new reimbursement category
 * @access  Private (Admin recommended)
 */
router.post(
  "/",
  // requireAdmin, // enable if needed
  ReimbursementSettingsCategoriesController.createCategory
);

/**
 * @route   PUT /api/reimbursement-settings-categories/:id
 * @desc    Update reimbursement category
 * @access  Private (Admin recommended)
 */
router.put(
  "/:id",
  // requireAdmin,
  ReimbursementSettingsCategoriesController.updateCategory
);

/**
 * @route   DELETE /api/reimbursement-settings-categories/:id
 * @desc    Delete reimbursement category
 * @access  Private (Admin recommended)
 */
router.delete(
  "/:id",
  // requireAdmin,
  ReimbursementSettingsCategoriesController.deleteCategory
);

export default router;