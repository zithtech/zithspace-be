import { Router } from "express";
import { ReimbursementConfigurationController } from "@/controllers/reimbursementConfigController";
import { authenticateToken, requireAuth, requireAdmin } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

// Middleware: tenant resolution & authentication
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/* ================== REIMBURSEMENT CONFIG ROUTES ================== */

/**
 * @route   GET /api/reimbursements
 * @desc    Get all reimbursement configurations (with monthly/yearly calculation)
 * @access  Private
 */
router.get("/", ReimbursementConfigurationController.getConfigs);

/**
 * @route   GET /api/reimbursements/:id
 * @desc    Get single reimbursement configuration by ID
 * @access  Private
 */
router.get("/:id", ReimbursementConfigurationController.getConfigById);

/**
 * @route   POST /api/reimbursements
 * @desc    Create new reimbursement configuration
 * @access  Private (Admin recommended)
 */
router.post(
  "/",
  // requireAdmin, // enable if only admin can create
  ReimbursementConfigurationController.createConfig
);

/**
 * @route   PUT /api/reimbursements/:id
 * @desc    Update reimbursement configuration
 * @access  Private (Admin recommended)
 */
router.put(
  "/:id",
  // requireAdmin,
  ReimbursementConfigurationController.updateConfig
);

/**
 * @route   DELETE /api/reimbursements/:id
 * @desc    Delete reimbursement configuration
 * @access  Private (Admin recommended)
 */
router.delete(
  "/:id",
  // requireAdmin,
  ReimbursementConfigurationController.deleteConfig
);


export default router;