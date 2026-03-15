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
 * @route   GET /api/documenthub/:id
 * @desc    Get documenthub by id
 * @access  Public (all users)
 */
router.get("/:id", requirePermission(Permissions.DOCUMENT_READ), DocumentHubController.getDocumentHubById);

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

export default router;
