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
 * @route   GET /api/documenthub/:id
 * @desc    Get documenthub by id
 * @access  Public (all users)
 */
router.get("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.DOCUMENT_READ), documentHubController_1.DocumentHubController.getDocumentHubById);
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
exports.default = router;
//# sourceMappingURL=documenthub.js.map