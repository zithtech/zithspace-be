import { Router } from "express";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { DocumentHubController } from "@/controllers/documentHubController";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

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
router.get("/", requirePermission(Permissions.DOCUMENT_READ), DocumentHubController.getAllDocumentHubs);

/**
 * @route   POST /api/documenthub
 * @desc    Create documenthub (tenant-aware)
 * @access  Public (all users)
 * @body    CreateAttendanceData
 */
router.post("/", requirePermission(Permissions.DOCUMENT_CREATE), DocumentHubController.createDocumentHub);

/**
 * @route   GET /api/documenthub/trash
 * @desc    Get trash items (hubs and documents)
 * @access  Private
 */
router.get("/trash", requirePermission(Permissions.DOCUMENT_READ), DocumentHubController.getTrash);

/**
 * @route   GET /api/documenthub/:id
 * @desc    Get documenthub by id
 * @access  Public (all users)
 */
router.get("/:id", requirePermission(Permissions.DOCUMENT_READ), DocumentHubController.getDocumentHubById);

/**
 * @route   DELETE /api/documenthub/:id
 * @desc    Delete documenthub by id
 * @access  Public (all users)
 */
router.delete("/:id", requirePermission(Permissions.DOCUMENT_DELETE), DocumentHubController.deleteDocumentHub);

/**
 * @route   POST /api/documenthub/:id/restore
 * @desc    Restore documenthub by id
 * @access  Private
 */
router.post("/:id/restore", requirePermission(Permissions.DOCUMENT_UPDATE), DocumentHubController.restoreDocumentHub);

/**
 * @route   POST /api/documenthub/node
 * @desc    Create document tree node
 * @access  Public (all users)
 */
router.post("/node", requirePermission(Permissions.DOCUMENT_CREATE), DocumentHubController.createTreeNode);

/**
 * @route   PUT /api/documenthub/node/:id
 * @desc    Update document tree node
 * @access  Public (all users)
 */
router.put("/node/:id", requirePermission(Permissions.DOCUMENT_UPDATE), DocumentHubController.updateTreeNode);

/**
 * @route   DELETE /api/documenthub/node/:id
 * @desc    Delete document tree node
 * @access  Public (all users)
 */
router.delete("/node/:id", requirePermission(Permissions.DOCUMENT_DELETE), DocumentHubController.deleteTreeNode);

/**
 * @route   GET /api/documenthub/document/:id
 * @desc    Get document by id
 * @access  Public (all users)
 */
router.get("/document/:id", requirePermission(Permissions.DOCUMENT_READ), DocumentHubController.getDocument);

/**
 * @route   PUT /api/documenthub/document/:id
 * @desc    Update document by id
 * @access  Public (all users)
 */
router.put("/document/:id", requirePermission(Permissions.DOCUMENT_UPDATE), DocumentHubController.updateDocument);

/**
 * @route   GET /api/documenthub/document/:id/history
 * @desc    Get document history
 * @access  Public (all users)
 */
router.get("/document/:id/history", requirePermission(Permissions.DOCUMENT_READ), DocumentHubController.getDocumentHistory);

/**
 * @route   DELETE /api/documenthub/document/:id
 * @desc    Delete document by id (soft delete)
 * @access  Private
 */
router.delete("/document/:id", requirePermission(Permissions.DOCUMENT_DELETE), DocumentHubController.deleteDocument);

/**
 * @route   POST /api/documenthub/document/:id/restore
 * @desc    Restore document by id
 * @access  Private
 */
router.post("/document/:id/restore", requirePermission(Permissions.DOCUMENT_UPDATE), DocumentHubController.restoreDocument);

/**
 * @route   PUT /api/documenthub/document/:id/share
 * @desc    Share document
 * @access  Private
 */
router.put("/document/:id/share", requirePermission(Permissions.DOCUMENT_UPDATE), DocumentHubController.shareDocument);

/**
 * @route   DELETE /api/documenthub/document/:id/share
 * @desc    Revoke document sharing
 * @access  Private
 */
router.delete("/document/:id/share", requirePermission(Permissions.DOCUMENT_UPDATE), DocumentHubController.revokeShare);

export default router;
