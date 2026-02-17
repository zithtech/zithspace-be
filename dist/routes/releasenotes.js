"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const releasenotesController_1 = __importDefault(require("@/controllers/releasenotesController"));
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/**
 * @route   GET /api/releasenotes
 * @desc    Get all release notes (tenant-aware, paginated, filterable)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, projectId, version, status, search, sortBy, sortOrder
 */
router.get('/', releasenotesController_1.default.getReleaseNotes);
/**
 * @route   GET /api/releasenotes/:id
 * @desc    Get release note by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release note ID
 */
router.get('/:id', releasenotesController_1.default.getReleaseNoteById);
/**
 * @route   POST /api/releasenotes
 * @desc    Create a new release note (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    CreateReleaseNoteData
 */
router.post('/', releasenotesController_1.default.createReleaseNote);
/**
 * @route   PUT /api/releasenotes/:id
 * @desc    Update a release note (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release note ID
 * @body    UpdateReleaseNoteData
 */
router.put('/:id', releasenotesController_1.default.updateReleaseNote);
/**
 * @route   DELETE /api/releasenotes/:id
 * @desc    Soft delete a release note (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release note ID
 */
router.delete('/:id', releasenotesController_1.default.deleteReleaseNote);
exports.default = router;
//# sourceMappingURL=releasenotes.js.map