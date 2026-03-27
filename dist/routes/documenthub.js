"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const documentHubController_1 = require("@/controllers/documentHubController");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/**
 * @route   GET /api/documenthub
 * @desc    Get all document hubs
 * @access  Public (all users)
 */
router.get("/", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_READ), documentHubController_1.DocumentHubController.getAllDocumentHubs);
/**
 * @route   POST /api/documenthub
 * @desc    Create documenthub (tenant-aware)
 * @access  Public (all users)
 * @body    CreateAttendanceData
 */
router.post("/", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_CREATE), documentHubController_1.DocumentHubController.createDocumentHub);
/**
 * @route   GET /api/documenthub/trash
 * @desc    Get trash items (hubs and documents)
 * @access  Private
 */
router.get("/trash", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_READ), documentHubController_1.DocumentHubController.getTrash);
/**
 * @route   GET /api/documenthub/:id
 * @desc    Get documenthub by id
 * @access  Public (all users)
 */
router.get("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_READ), documentHubController_1.DocumentHubController.getDocumentHubById);
/**
 * @route   DELETE /api/documenthub/:id
 * @desc    Delete documenthub by id
 * @access  Public (all users)
 */
router.delete("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_DELETE), documentHubController_1.DocumentHubController.deleteDocumentHub);
/**
 * @route   POST /api/documenthub/:id/restore
 * @desc    Restore documenthub by id
 * @access  Private
 */
router.post("/:id/restore", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_UPDATE), documentHubController_1.DocumentHubController.restoreDocumentHub);
/**
 * @route   POST /api/documenthub/node
 * @desc    Create document tree node
 * @access  Public (all users)
 */
router.post("/node", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_CREATE), documentHubController_1.DocumentHubController.createTreeNode);
/**
 * @route   PUT /api/documenthub/node/:id
 * @desc    Update document tree node
 * @access  Public (all users)
 */
router.put("/node/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_UPDATE), documentHubController_1.DocumentHubController.updateTreeNode);
/**
 * @route   DELETE /api/documenthub/node/:id
 * @desc    Delete document tree node
 * @access  Public (all users)
 */
router.delete("/node/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_DELETE), documentHubController_1.DocumentHubController.deleteTreeNode);
/**
 * @route   GET /api/documenthub/document/:id
 * @desc    Get document by id
 * @access  Public (all users)
 */
router.get("/document/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_READ), documentHubController_1.DocumentHubController.getDocument);
/**
 * @route   PUT /api/documenthub/document/:id
 * @desc    Update document by id
 * @access  Public (all users)
 */
router.put("/document/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_UPDATE), documentHubController_1.DocumentHubController.updateDocument);
/**
 * @route   GET /api/documenthub/document/:id/history
 * @desc    Get document history
 * @access  Public (all users)
 */
router.get("/document/:id/history", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_READ), documentHubController_1.DocumentHubController.getDocumentHistory);
/**
 * @route   DELETE /api/documenthub/document/:id
 * @desc    Delete document by id (soft delete)
 * @access  Private
 */
router.delete("/document/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_DELETE), documentHubController_1.DocumentHubController.deleteDocument);
/**
 * @route   POST /api/documenthub/document/:id/restore
 * @desc    Restore document by id
 * @access  Private
 */
router.post("/document/:id/restore", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_UPDATE), documentHubController_1.DocumentHubController.restoreDocument);
/**
 * @route   PUT /api/documenthub/document/:id/share
 * @desc    Share document
 * @access  Private
 */
router.put("/document/:id/share", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_UPDATE), documentHubController_1.DocumentHubController.shareDocument);
/**
 * @route   DELETE /api/documenthub/document/:id/share
 * @desc    Revoke document sharing
 * @access  Private
 */
router.delete("/document/:id/share", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_UPDATE), documentHubController_1.DocumentHubController.revokeShare);
exports.default = router;
//# sourceMappingURL=documenthub.js.map