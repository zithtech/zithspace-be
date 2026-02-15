import { Router } from "express";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { DocumentHubController } from "@/controllers/documentHubController";

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/documenthub
 * @desc    Get all document hubs
 * @access  Public (all users)
 */
router.get("/", DocumentHubController.getAllDocumentHubs);

/**
 * @route   GET /api/documenthub/trash
 * @desc    Get trash items (hubs and documents)
 * @access  Public (all users)
 */
router.get("/trash", DocumentHubController.getTrash);

/**
 * @route   POST /api/documenthub
 * @desc    Create documenthub (tenant-aware)
 * @access  Public (all users)
 * @body    CreateAttendanceData
 */
router.post("/", DocumentHubController.createDocumentHub);

/**
 * @route   GET /api/documenthub/:id
 * @desc    Get documenthub by id
 * @access  Public (all users)
 */
router.get("/:id", DocumentHubController.getDocumentHubById);

/**
 * @route   DELETE /api/documenthub/:id
 * @desc    Soft delete documenthub
 * @access  Public (all users)
 */
router.delete("/:id", DocumentHubController.deleteDocumentHub);

/**
 * @route   POST /api/documenthub/:id/restore
 * @desc    Restore documenthub
 * @access  Public (all users)
 */
router.post("/:id/restore", DocumentHubController.restoreDocumentHub);

/**
 * @route   POST /api/documenthub/node
 * @desc    Create document tree node
 * @access  Public (all users)
 */
router.post("/node", DocumentHubController.createTreeNode);

/**
 * @route   PUT /api/documenthub/node/:id
 * @desc    Update document tree node
 * @access  Public (all users)
 */
router.put("/node/:id", DocumentHubController.updateTreeNode);

/**
 * @route   GET /api/documenthub/document/:id
 * @desc    Get document by id
 * @access  Public (all users)
 */
router.get("/document/:id", DocumentHubController.getDocument);

/**
 * @route   PUT /api/documenthub/document/:id
 * @desc    Update document by id
 * @access  Public (all users)
 */
router.put("/document/:id", DocumentHubController.updateDocument);

/**
 * @route   DELETE /api/documenthub/document/:id
 * @desc    Soft delete document
 * @access  Public (all users)
 */
router.delete("/document/:id", DocumentHubController.deleteDocument);

/**
 * @route   POST /api/documenthub/document/:id/restore
 * @desc    Restore document
 * @access  Public (all users)
 */
router.post("/document/:id/restore", DocumentHubController.restoreDocument);

/**
 * @route   GET /api/documenthub/document/:id/history
 * @desc    Get document history
 * @access  Public (all users)
 */
router.get("/document/:id/history", DocumentHubController.getDocumentHistory);

/**
 * @route   PUT /api/documenthub/document/:id/share
 * @desc    Set document visibility (private/internal/public)
 * @access  Authenticated users
 */
router.put("/document/:id/share", DocumentHubController.shareDocument);

/**
 * @route   DELETE /api/documenthub/document/:id/share
 * @desc    Revoke document sharing (set to private)
 * @access  Authenticated users
 */
router.delete("/document/:id/share", DocumentHubController.revokeShare);

export default router;
