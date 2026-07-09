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
 * @route   POST /api/documenthub/ai-generate
 * @desc    Generate a documentation draft from a free-form prompt (Gemini-backed,
 *          mock fallback). Does not persist; client creates the hub afterwards.
 * @access  Private (DOCUMENT_CREATE)
 */
router.post("/ai-generate", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_CREATE), documentHubController_1.DocumentHubController.aiGenerateDocument);
/**
 * @route   POST /api/documenthub/ai-rewrite
 * @desc    Rewrite a selected excerpt of a document per a user instruction.
 *          Used by the inline Zai menu in the editor.
 * @access  Private (DOCUMENT_UPDATE)
 */
router.post("/ai-rewrite", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_UPDATE), documentHubController_1.DocumentHubController.aiRewriteSelection);
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
 * @route   PATCH /api/documenthub/:id
 * @desc    Update documenthub (rename)
 * @access  Public (all users)
 */
router.patch("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_UPDATE), documentHubController_1.DocumentHubController.updateDocumentHub);
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
 * @route   POST /api/documenthub/node/:id/restore
 * @desc    Restore document tree node by id
 * @access  Private
 */
router.post("/node/:id/restore", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_UPDATE), documentHubController_1.DocumentHubController.restoreTreeNode);
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
 * @route   DELETE /api/documenthub/document/:id/history/:historyId
 * @desc    Delete a single version from a document's history
 * @access  Private (DOCUMENT_DELETE)
 */
router.delete("/document/:id/history/:historyId", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_DELETE), documentHubController_1.DocumentHubController.deleteDocumentHistoryEntry);
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
/**
 * @route   PUT /api/documenthub/:id/share
 * @desc    Share entire document hub
 * @access  Private
 */
router.put("/:id/share", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_UPDATE), documentHubController_1.DocumentHubController.shareDocumentHub);
/**
 * @route   POST /api/documenthub/:id/star
 * @desc    Star a document hub for the current user (raw SQL — no Prisma model)
 * @access  Private (DOCUMENT_READ)
 */
router.post("/:id/star", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_READ), documentHubController_1.DocumentHubController.starDocumentHub);
/**
 * @route   DELETE /api/documenthub/:id/star
 * @desc    Remove the current user's star from a document hub (raw SQL)
 * @access  Private (DOCUMENT_READ)
 */
router.delete("/:id/star", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_READ), documentHubController_1.DocumentHubController.unstarDocumentHub);
/**
 * @route   DELETE /api/documenthub/:id/share
 * @desc    Revoke hub sharing
 * @access  Private
 */
router.delete("/:id/share", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_UPDATE), documentHubController_1.DocumentHubController.revokeHubShare);
router.get("/document/:id/pdf", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_READ), documentHubController_1.DocumentHubController.downloadDocumentPdf);
exports.default = router;
//# sourceMappingURL=documenthub.js.map