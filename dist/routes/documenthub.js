"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const documentHubController_1 = require("@/controllers/documentHubController");
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
router.get("/", documentHubController_1.DocumentHubController.getAllDocumentHubs);
/**
 * @route   GET /api/documenthub/trash
 * @desc    Get trash items (hubs and documents)
 * @access  Public (all users)
 */
router.get("/trash", documentHubController_1.DocumentHubController.getTrash);
/**
 * @route   POST /api/documenthub
 * @desc    Create documenthub (tenant-aware)
 * @access  Public (all users)
 * @body    CreateAttendanceData
 */
router.post("/", documentHubController_1.DocumentHubController.createDocumentHub);
/**
 * @route   GET /api/documenthub/:id
 * @desc    Get documenthub by id
 * @access  Public (all users)
 */
router.get("/:id", documentHubController_1.DocumentHubController.getDocumentHubById);
/**
 * @route   DELETE /api/documenthub/:id
 * @desc    Soft delete documenthub
 * @access  Public (all users)
 */
router.delete("/:id", documentHubController_1.DocumentHubController.deleteDocumentHub);
/**
 * @route   POST /api/documenthub/:id/restore
 * @desc    Restore documenthub
 * @access  Public (all users)
 */
router.post("/:id/restore", documentHubController_1.DocumentHubController.restoreDocumentHub);
/**
 * @route   POST /api/documenthub/node
 * @desc    Create document tree node
 * @access  Public (all users)
 */
router.post("/node", documentHubController_1.DocumentHubController.createTreeNode);
/**
 * @route   PUT /api/documenthub/node/:id
 * @desc    Update document tree node
 * @access  Public (all users)
 */
router.put("/node/:id", documentHubController_1.DocumentHubController.updateTreeNode);
/**
 * @route   GET /api/documenthub/document/:id
 * @desc    Get document by id
 * @access  Public (all users)
 */
router.get("/document/:id", documentHubController_1.DocumentHubController.getDocument);
/**
 * @route   PUT /api/documenthub/document/:id
 * @desc    Update document by id
 * @access  Public (all users)
 */
router.put("/document/:id", documentHubController_1.DocumentHubController.updateDocument);
/**
 * @route   DELETE /api/documenthub/document/:id
 * @desc    Soft delete document
 * @access  Public (all users)
 */
router.delete("/document/:id", documentHubController_1.DocumentHubController.deleteDocument);
/**
 * @route   POST /api/documenthub/document/:id/restore
 * @desc    Restore document
 * @access  Public (all users)
 */
router.post("/document/:id/restore", documentHubController_1.DocumentHubController.restoreDocument);
/**
 * @route   GET /api/documenthub/document/:id/history
 * @desc    Get document history
 * @access  Public (all users)
 */
router.get("/document/:id/history", documentHubController_1.DocumentHubController.getDocumentHistory);
/**
 * @route   PUT /api/documenthub/document/:id/share
 * @desc    Set document visibility (private/internal/public)
 * @access  Authenticated users
 */
router.put("/document/:id/share", documentHubController_1.DocumentHubController.shareDocument);
/**
 * @route   DELETE /api/documenthub/document/:id/share
 * @desc    Revoke document sharing (set to private)
 * @access  Authenticated users
 */
router.delete("/document/:id/share", documentHubController_1.DocumentHubController.revokeShare);
exports.default = router;
//# sourceMappingURL=documenthub.js.map