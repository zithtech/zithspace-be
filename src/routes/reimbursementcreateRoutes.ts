import { Router } from "express";
import { ReimbursementController } from "@/controllers/reimbursementcreateController";
import { authenticateToken, requireAuth, requireAdmin } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import multer from "multer";

// Setup multer for file uploads (temp storage)
const upload = multer({ dest: "uploads/" });

const router = Router();

// Middleware: tenant resolution & authentication
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/* ================== REIMBURSEMENT ROUTES ================== */

/**
 * @route   POST /api/reimbursements
 * @desc    Create new reimbursement (with file uploads)
 * @access  Private
 */
router.post(
  "/",
  upload.array("files"), // Expect multiple files with field name "files"
  // requireAdmin, // Enable if only admin can create
  ReimbursementController.create
);
// Add this temporarily to your router

/**
 * @route   GET /api/reimbursements
 * @desc    Get all reimbursements
 * @access  Private
 */
router.get("/", ReimbursementController.getAll);

/**
 * @route   GET /api/reimbursements/:id
 * @desc    Get reimbursement by ID
 * @access  Private
 */
router.get("/:id", ReimbursementController.getById);

/**
 * @route   PUT /api/reimbursements/:id
 * @desc    Update reimbursement status
 * @access  Private
 */
// router.put("/:id", ReimbursementController.update);
router.put(
  '/:id',  // ✅ CORRECT - just the ID parameter
  upload.fields([
    { name: 'items', maxCount: 1 },
    { name: 'files' }
  ]),
  ReimbursementController.update
);

/**
 * @route   DELETE /api/reimbursements/:id
 * @desc    Delete reimbursement
 * @access  Private
 */
router.delete("/:id", ReimbursementController.delete);

router.get('/user/limits', ReimbursementController.getUserReimbursementLimits);
router.get('/manager/approvals', ReimbursementController.getApprovalList);
// In your routes file
router.post("/approve", ReimbursementController.approve);
router.post("/reject", ReimbursementController.reject);
// router.put(
//   "/:id/mark-paid",
//   ReimbursementController.markAsPaid
// );
router.get(
   "/finance/items", 
 
  ReimbursementController.getFinanceItems
);
router.put(
  "/:id/mark-paid",
  ReimbursementController.markAsPaid
);















export default router;